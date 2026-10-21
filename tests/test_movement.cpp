#include "../main/movement.hpp"
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
    for(int h=0;h<24;h++) for(int m=0;m<60;m++) for(int k=0;k<600;k++) {
        auto p=pose(h,m,k/10.0);
        assert(p.hour>=0 && p.hour<360 && p.minute>=0 && p.minute<360 && p.second>=0 && p.second<360);
    }
    puts("Movement checks passed: sweep, hold, minute advance, midnight wrap, and full-day angle ranges.");
}
