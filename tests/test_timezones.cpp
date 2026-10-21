#include <cassert>
#include <iostream>
#include <string>
#include "../main/timezones.hpp"

int main(int argc, char **) {
    using namespace clock_zone;
    assert(find("Sydney") == find("Australia/Sydney"));
    assert(find("Berlin") == find("Europe/Berlin"));
    assert(find("UTC") >= 0 && find("Asia/Kathmandu") >= 0);
    assert(find(nullptr) == -1 && find("") == -1 && find("Europe/London\nDEMO") == -1);
    assert(restore("", 0) == find("Sydney"));
    assert(restore("", 1) == find("Berlin"));
    assert(restore("", 2) == find("UTC"));
    assert(restore("corrupt", 123) == find("Sydney"));
    assert(restore("Asia/Kathmandu", 1) == find("Asia/Kathmandu"));
    assert(offset_at(find("UTC"), 1792544400) == 0);
    assert(offset_at(find("Asia/Kathmandu"), 1792544400) == 20700);
    assert(offset_at(-1, 1792544400) == 0);
    for (std::size_t i = 0; i < count; ++i) {
        assert(std::strlen(data::zones[i].id) < 64);
        assert(find(data::zones[i].id) == int(i));
        const auto &zone = data::zones[i];
        assert(zone.count > 0 && data::transitions[zone.first].since == 0);
        for (unsigned j = 1; j < zone.count; ++j)
            assert(data::transitions[zone.first + j - 1].since < data::transitions[zone.first + j].since);
    }
    if (argc == 1) { std::cout << count << " timezone IDs and legacy migration verified\n"; return 0; }
    std::string id;
    int64_t epoch;
    while (std::cin >> id >> epoch) std::cout << offset_at(find(id.c_str()), epoch) << '\n';
}
