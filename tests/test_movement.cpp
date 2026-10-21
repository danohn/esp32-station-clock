#include "../main/movement.hpp"
#include "../main/theme_input.hpp"
#include <cassert>
#include <cmath>
#include <cstdio>
static bool near(double a, double b) { return std::abs(a-b)<1e-7; }
int main() {
    using railway::pose;
    assert(near(pose(10,9,29).second,180));
    assert(near(pose(10,9,57.999).second,57.999/58*360));
    assert(pose(10,9,58).waiting && near(pose(10,9,58).second,0));
    assert(pose(10,9,59.999).waiting && near(pose(10,9,59.999).minute,54));
    assert(!pose(10,10,0).waiting && near(pose(10,10,0).second,0));
    assert(near(pose(10,10,0).minute,54));
    assert(near(pose(10,10,0.09).minute,57));
    assert(near(pose(10,10,0.18).minute,60));
    assert(near(pose(0,0,0).minute,354));
    assert(near(pose(0,0,0.18).minute,0));
    assert(near(pose(0,0,0.18).hour,0));
    const railway::Movement swiss{58.5,0.18};
    assert(near(pose(10,9,29.25,swiss).second,180));
    assert(!pose(10,9,58.25,swiss).waiting);
    assert(pose(10,9,58.25).waiting);
    assert(pose(10,9,58.5,swiss).waiting && near(pose(10,9,58.5,swiss).second,0));
    assert(pose(10,9,59.999,swiss).waiting);
    assert(near(pose(0,0,0,swiss).minute,354));
    assert(near(pose(0,0,.18,swiss).minute,0));
    for(auto movement : {railway::Movement{},swiss})
    for(int h=0;h<24;h++) for(int m=0;m<60;m++) for(int k=0;k<600;k++) {
        auto p=pose(h,m,k/10.0,movement);
        assert(p.hour>=0 && p.hour<360 && p.minute>=0 && p.minute<360 && p.second>=0 && p.second<360);
    }
    railway::ThemeInput input;
    using Action=railway::ThemeInput::Action;
    assert(input.end(0,0)==Action::none);
    input.begin(200,200);input.move(140,210);assert(input.end(140,210)==Action::next);
    input.begin(100,200);assert(input.end(145,205)==Action::previous);
    input.begin(100,200);assert(input.end(145,245)==Action::none);
    input.begin(100,200);assert(input.end(105,300)==Action::none);
    input.begin(100,425);assert(input.end(104,426)==Action::pill);
    input.begin(100,200);assert(input.end(104,201)==Action::none);
    input.begin(100,425);input.move(160,425);assert(input.end(100,425)==Action::none);
    assert(input.dragged());
    input.begin(100,425);input.cancel();assert(input.end(100,425)==Action::none);
    puts("DB/Swiss movement and gesture checks passed: sweeps, holds, midnight, full-day angles, intentional swipes and pill taps.");
}
