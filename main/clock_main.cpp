#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <ctime>
#include <sys/time.h>
#include <string>
#include "bsp/esp-bsp.h"
#include "cJSON.h"
#include "driver/i2c_master.h"
#include "esp_event.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_netif_sntp.h"
#include "esp_sntp.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lvgl.h"
#include "nvs_flash.h"
#include "movement.hpp"
#include "board_display.hpp"


extern "C" {
LV_IMAGE_DECLARE(clock_dial);
LV_IMAGE_DECLARE(clock_hour);
LV_IMAGE_DECLARE(clock_minute);
LV_IMAGE_DECLARE(clock_second);
}
static const char *TAG="station_clock";
static lv_obj_t *hour_hand,*minute_hand,*second_hand;
static const lv_image_dsc_t *cache_asset(const lv_image_dsc_t *source) {
    static lv_image_dsc_t cached[4];
    static unsigned count=0;
    auto *pixels=static_cast<uint8_t *>(heap_caps_aligned_alloc(16,source->data_size,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT));
    if(!pixels || count>=4) {
        free(pixels);
        ESP_LOGW(TAG,"Using flash artwork (RAM cache unavailable)");
        return source;
    }
    memcpy(pixels,source->data,source->data_size);
    cached[count]=*source;cached[count].data=pixels;
    return &cached[count++];
}
static unsigned rendered_frames=0;
static int64_t render_started=0,render_total=0;
static void render_event(lv_event_t *event) {
    if(lv_event_get_code(event)==LV_EVENT_RENDER_START) render_started=esp_timer_get_time();
    else if(lv_event_get_code(event)==LV_EVENT_RENDER_READY) {
        rendered_frames++;render_total+=esp_timer_get_time()-render_started;
    }
}
static i2c_master_dev_handle_t rtc=nullptr;
static std::atomic<int64_t> demo_start{0};
static std::atomic<int> timezone_choice{0};
static bool sntp_started=false;
static bool wifi_started=false;
static nvs_handle_t settings;
static const char *zones[]={"AEST-10AEDT,M10.1.0,M4.1.0/3", "CET-1CEST,M3.5.0,M10.5.0/3", "UTC0"};
static const char *zone_names[]={"Sydney", "Berlin", "UTC"};
static uint8_t bcd(int x) { return (x/10)*16+x%10; }
static int decimal(uint8_t x) { return (x>>4)*10+(x&15); }

static bool rtc_read(time_t &epoch) {
    if(!rtc) return false;
    uint8_t reg=4,v[7];
    if(i2c_master_transmit_receive(rtc,&reg,1,v,7,100)!=ESP_OK || (v[0]&0x80)) return false;
    tm t{};
    t.tm_sec=decimal(v[0]&0x7f); t.tm_min=decimal(v[1]&0x7f); t.tm_hour=decimal(v[2]&0x3f);
    t.tm_mday=decimal(v[3]&0x3f); t.tm_mon=decimal(v[5]&0x1f)-1; t.tm_year=100+decimal(v[6]);
    if(t.tm_year<124 || t.tm_mon<0 || t.tm_mon>11 || t.tm_mday<1 || t.tm_mday>31 || t.tm_hour>23 || t.tm_min>59 || t.tm_sec>59) return false;
    // RTC is always UTC; ESP-IDF/newlib timegm is not available on every release.
    const char *saved=getenv("TZ"); std::string restore=saved?saved:"UTC0";
    setenv("TZ","UTC0",1); tzset(); epoch=mktime(&t);
    setenv("TZ",restore.c_str(),1); tzset();
    return epoch>1704067200;
}
static void rtc_write() {
    if(!rtc) return;
    time_t now=time(nullptr); tm t{}; gmtime_r(&now,&t);
    uint8_t v[]={4,bcd(t.tm_sec),bcd(t.tm_min),bcd(t.tm_hour),bcd(t.tm_mday),bcd(t.tm_wday),bcd(t.tm_mon+1),bcd((t.tm_year+1900)%100)};
    if(i2c_master_transmit(rtc,v,sizeof(v),100)!=ESP_OK) ESP_LOGW(TAG,"RTC update failed");
}
static void apply_zone(int choice, bool save=true) {
    if(choice<0 || choice>2) return;
    timezone_choice.store(choice);
    setenv("TZ",zones[choice],1); tzset();
    if(save) { nvs_set_i32(settings,"zone",choice); nvs_commit(settings); }
    ESP_LOGI(TAG,"Timezone: %s",zone_names[choice]);
}
static void time_received(struct timeval *) {
    rtc_write();
    ESP_LOGI(TAG,"Network time synchronised");
}
static void wifi_event(void *,esp_event_base_t base,int32_t event,void *) {
    if(base==WIFI_EVENT && event==WIFI_EVENT_STA_START) esp_wifi_connect();
    if(base==WIFI_EVENT && event==WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGW(TAG,"Wi-Fi disconnected; clock continues offline");
        esp_wifi_connect();
    }
    if(base==IP_EVENT && event==IP_EVENT_STA_GOT_IP && !sntp_started) {
        esp_sntp_config_t cfg=ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
        cfg.smooth_sync=true; cfg.sync_cb=time_received;
        ESP_ERROR_CHECK(esp_netif_sntp_init(&cfg)); sntp_started=true;
    }
}
static void start_wifi(const char *ssid,const char *password) {
    if(!ssid || !*ssid || strlen(ssid)>32 || !password || strlen(password)>63) return;
    if(!wifi_started) {
        ESP_ERROR_CHECK(esp_netif_init());
        ESP_ERROR_CHECK(esp_event_loop_create_default());
        esp_netif_create_default_wifi_sta();
        wifi_init_config_t cfg=WIFI_INIT_CONFIG_DEFAULT();
        ESP_ERROR_CHECK(esp_wifi_init(&cfg));
        ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
        ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT,ESP_EVENT_ANY_ID,wifi_event,nullptr));
        ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT,IP_EVENT_STA_GOT_IP,wifi_event,nullptr));
        ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    } else esp_wifi_stop();
    wifi_config_t cfg{};
    memcpy(cfg.sta.ssid,ssid,strlen(ssid)); memcpy(cfg.sta.password,password,strlen(password));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA,&cfg));
    ESP_ERROR_CHECK(esp_wifi_start());
    esp_wifi_set_ps(WIFI_PS_NONE);
    wifi_started=true;
    ESP_LOGI(TAG,"Wi-Fi connection requested (credentials hidden)");
}
static void replay() { demo_start.store(esp_timer_get_time()); ESP_LOGI(TAG,"Minute-change demonstration started (12 seconds)"); }
static lv_obj_t *make_hand(const lv_image_dsc_t *asset,int x,int y) {
    lv_obj_t *obj=lv_image_create(lv_screen_active());
    lv_image_set_src(obj,cache_asset(asset)); lv_image_set_pivot(obj,x,y);
    lv_obj_set_pos(obj,184-x,224-y); lv_image_set_antialias(obj,true);
    lv_obj_set_clickable(obj,false);
    return obj;
}
static void update_clock(lv_timer_t *) {
    timeval tv{}; gettimeofday(&tv,nullptr);
    tm local{}; localtime_r(&tv.tv_sec,&local);
    double seconds=local.tm_sec+tv.tv_usec/1000000.0;
    int64_t start=demo_start.load();
    if(start) {
        const double elapsed=(esp_timer_get_time()-start)/1000000.0;
        if(elapsed<12) {
            const double t=54+elapsed;
            local.tm_hour=10; local.tm_min=9+int(t/60); seconds=fmod(t,60);
        } else demo_start.store(0);
    }
    const auto p=railway::pose(local.tm_hour,local.tm_min,seconds);
    lv_image_set_rotation(hour_hand,int(std::lround(p.hour*10))%3600);
    lv_image_set_rotation(minute_hand,int(std::lround(p.minute*10))%3600);
    lv_image_set_rotation(second_hand,int(std::lround(p.second*10))%3600);
    static bool was_waiting=false;
    if(p.waiting!=was_waiting) {
        ESP_LOGI(TAG,"Movement: %s at %02d:%02d:%06.3f",p.waiting?"WAIT":"RESTART",local.tm_hour,local.tm_min,seconds);
        was_waiting=p.waiting;
    }
    static int64_t first=esp_timer_get_time(); static unsigned frames=0;
    frames++;
    const int64_t now=esp_timer_get_time();
    if(now-first>=10000000) {
        ESP_LOGI(TAG,"Animation updates %.1f Hz; rendered %.1f fps; render avg %.2f ms; free internal %u; free PSRAM %u", frames*1000000.0/(now-first),
            rendered_frames*1000000.0/(now-first),rendered_frames?render_total/1000.0/rendered_frames:0,
            unsigned(heap_caps_get_free_size(MALLOC_CAP_INTERNAL)),unsigned(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)));
        first=now; frames=0;rendered_frames=0;render_total=0;
    }
}
static void face_event(lv_event_t *event) {
    if(lv_event_get_code(event)==LV_EVENT_DOUBLE_CLICKED) replay();
}
static void status() {
    timeval tv{}; gettimeofday(&tv,nullptr); tm local{};localtime_r(&tv.tv_sec,&local);
    printf("CLOCK_STATUS time=%04d-%02d-%02dT%02d:%02d:%02d.%03ld zone=%s epoch_us=%lld demo=%d\n",
        local.tm_year+1900,local.tm_mon+1,local.tm_mday,local.tm_hour,local.tm_min,local.tm_sec,tv.tv_usec/1000,
        zone_names[timezone_choice.load()],(long long)tv.tv_sec*1000000+tv.tv_usec,demo_start.load()!=0);
    fflush(stdout);
}
static void command(const std::string &line) {
    if(line.rfind("TIME ",0)==0) {
        char *end=nullptr; const auto us=strtoll(line.c_str()+5,&end,10);
        if(end && *end==0 && us>=1704067200000000LL && us<4102444800000000LL) {
            timeval tv{time_t(us/1000000),suseconds_t(us%1000000)}; settimeofday(&tv,nullptr);
            rtc_write(); printf("CLOCK_OK time\n"); status();
        } else printf("CLOCK_ERROR invalid timestamp\n");
    } else if(line=="STATUS") status();
    else if(line=="DEMO") replay();
    else if(line=="LIVE") { demo_start.store(0); printf("CLOCK_OK live\n"); }
    else if(line.rfind("TZ ",0)==0) {
        const auto zone=line.substr(3); int found=-1;
        for(int i=0;i<3;i++) if(zone==zone_names[i]) found=i;
        if(found>=0) { apply_zone(found); printf("CLOCK_OK timezone\n"); }
        else printf("CLOCK_ERROR timezone must be Sydney, Berlin or UTC\n");
    } else if(line.rfind("BRIGHTNESS ",0)==0) {
        char *end=nullptr; long value=strtol(line.c_str()+11,&end,10);
        if(end && *end==0 && value>=5 && value<=100) {
            bsp_display_brightness_set(value); nvs_set_i32(settings,"brightness",value); nvs_commit(settings);
            printf("CLOCK_OK brightness\n");
        } else printf("CLOCK_ERROR brightness must be 5..100\n");
    } else if(line.rfind("WIFI ",0)==0) {
        cJSON *json=cJSON_Parse(line.c_str()+5);
        const cJSON *ssid=cJSON_GetObjectItemCaseSensitive(json,"ssid"),*pass=cJSON_GetObjectItemCaseSensitive(json,"password");
        if(cJSON_IsString(ssid)&&cJSON_IsString(pass)&&strlen(ssid->valuestring)>0&&strlen(ssid->valuestring)<=32&&strlen(pass->valuestring)<=63) {
            nvs_set_str(settings,"ssid",ssid->valuestring); nvs_set_str(settings,"password",pass->valuestring); nvs_commit(settings);
            start_wifi(ssid->valuestring,pass->valuestring); printf("CLOCK_OK wifi saved\n");
        } else printf("CLOCK_ERROR invalid Wi-Fi configuration\n");
        cJSON_Delete(json);
    } else if(line=="FORGET_WIFI") {
        nvs_erase_key(settings,"ssid"); nvs_erase_key(settings,"password"); nvs_commit(settings);
        if(wifi_started) esp_wifi_stop();
        printf("CLOCK_OK wifi forgotten\n");
    } else printf("CLOCK_ERROR unknown command\n");
    fflush(stdout);
}
static void console_task(void *) {
    std::string line; bool discard=false;
    for(;;) {
        int c=getchar();
        if(c==EOF) { clearerr(stdin); vTaskDelay(pdMS_TO_TICKS(10)); continue; }
        if(c=='\n'||c=='\r') {
            if(discard) printf("CLOCK_ERROR command too long\n");
            else if(!line.empty()) command(line);
            line.clear();discard=false;
        } else if(c>=32 && c<127 && !discard) {
            if(line.size()<512) line.push_back(char(c)); else { line.clear();discard=true; }
        }
    }
}
extern "C" void app_main() {
    esp_err_t err=nvs_flash_init();
    if(err==ESP_ERR_NVS_NO_FREE_PAGES||err==ESP_ERR_NVS_NEW_VERSION_FOUND) { ESP_ERROR_CHECK(nvs_flash_erase()); err=nvs_flash_init(); }
    ESP_ERROR_CHECK(err); ESP_ERROR_CHECK(nvs_open("clock",NVS_READWRITE,&settings));
    int32_t zone=0; nvs_get_i32(settings,"zone",&zone); apply_zone(zone,false);
    ESP_LOGI(TAG,"DB Station Clock 0.1.0 - starting display");
    lv_display_t *display=clock_display_start();
    ESP_ERROR_CHECK(display?ESP_OK:ESP_FAIL);
    int32_t brightness=65;nvs_get_i32(settings,"brightness",&brightness);
    ESP_ERROR_CHECK(bsp_display_brightness_set(brightness));
    // Attach to the BSP's already initialised I2C bus; never create a second driver.
    i2c_device_config_t rtc_config{};
    rtc_config.dev_addr_length=I2C_ADDR_BIT_LEN_7;
    rtc_config.device_address=0x51;rtc_config.scl_speed_hz=400000;
    ESP_ERROR_CHECK(i2c_master_bus_add_device(bsp_i2c_get_handle(),&rtc_config,&rtc));
    time_t saved;
    if(rtc_read(saved)) { timeval tv{saved,0};settimeofday(&tv,nullptr);ESP_LOGI(TAG,"Time restored from UTC RTC"); }
    else { ESP_LOGW(TAG,"RTC unset: set time over USB or configure Wi-Fi"); }
    if(bsp_display_lock(1000)) {
        lv_display_add_event_cb(display,render_event,LV_EVENT_RENDER_START,nullptr);
        lv_display_add_event_cb(display,render_event,LV_EVENT_RENDER_READY,nullptr);
        lv_obj_t *screen=lv_screen_active(); lv_obj_set_scrollable(screen,false);
        lv_obj_set_style_bg_color(screen,lv_color_black(),0);
        lv_obj_t *dial=lv_image_create(screen);lv_image_set_src(dial,cache_asset(&clock_dial));lv_obj_set_pos(dial,0,0);
        lv_obj_set_clickable(dial,false);
        hour_hand=make_hand(&clock_hour,16,112);minute_hand=make_hand(&clock_minute,12,158);second_hand=make_hand(&clock_second,18,166);
        lv_obj_add_event_cb(screen,face_event,LV_EVENT_DOUBLE_CLICKED,nullptr);
        lv_timer_create(update_clock,16,nullptr); update_clock(nullptr);
        bsp_display_unlock();
    }
    xTaskCreate(console_task,"clock_console",6144,nullptr,3,nullptr);
    char ssid[33]={0},password[64]={0};size_t sl=sizeof(ssid),pl=sizeof(password);
    if(nvs_get_str(settings,"ssid",ssid,&sl)==ESP_OK) { nvs_get_str(settings,"password",password,&pl); start_wifi(ssid,password); }
    printf("CLOCK_READY version=0.1.0\n"); status();
}
