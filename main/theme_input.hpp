#pragma once
#include <algorithm>
#include <cmath>

namespace railway {
// Pure gesture classification, shared by all themes. A recognizer belongs to
// one pointer sequence; tracking the maximum excursion prevents a drag that
// returns to its origin from being mistaken for a tap.
class ThemeInput {
public:
    void begin(int x, int y) { start_x=x; start_y=y; excursion=0; active=true; }
    void move(int x, int y) {
        if(active) excursion=std::max(excursion,std::max(std::abs(x-start_x),std::abs(y-start_y)));
    }
    enum class Action { none, previous, next, pill };
    Action end(int x, int y) {
        if(!active) return Action::none;
        move(x,y); active=false;
        const int dx=x-start_x,dy=y-start_y;
        if(std::abs(dx)>=40 && std::abs(dx)*2>=std::abs(dy)*3)
            return dx<0?Action::next:Action::previous;
        if(excursion<=10 && start_y>=408 && y>=408) return Action::pill;
        return Action::none;
    }
    void cancel() { active=false; }
    bool dragged() const { return excursion>10; }
private:
    int start_x=0,start_y=0,excursion=0;
    bool active=false;
};
} // namespace railway
