#include "../include/mirror_lighting.h"
#include <cassert>

int main() {
  MirrorLighting light;
  assert(light.screen(true) == 96 && light.lamp(true) == 0);
  light.sample(0, 550, false);
  assert(light.available() && light.screen(true) == 255 && light.lamp(true) == 0);

  light.sample(250, 3000, true);
  light.sample(500, 3000, true);
  assert(light.lamp(true) == 0);
  light.sample(750, 3000, true);
  assert(light.lamp(true) > 0 && light.screen(true) < 255);
  for (uint32_t t = 1000; t <= 3000; t += 250) light.sample(t, 3000, true);
  assert(light.screen(true) == 64 && light.lamp(true) == 255);
  assert(light.screen(false) == 0 && light.lamp(false) == 0);

  light.sample(3250, 550, false);
  light.sample(3500, 550, false);
  assert(light.lamp(true) > 0);
  light.sample(3750, 550, false);
  assert(light.lamp(true) == 0 && light.screen(true) > 64);

  light.sample(4000, 3000, true);
  light.sample(4250, 3000, true);
  light.sample(4500, 3000, true);
  assert(light.lamp(true) > 0);
  light.sample(6250, 0, true); // Brief interruption
  assert(light.available() && light.lamp(true) > 0);
  light.sample(6500, 0, true); // Unplugged for two seconds
  assert(!light.available() && light.screen(true) == 96 && light.lamp(true) == 0);
  assert(light.screen(false) == 0 && light.lamp(false) == 0);
  light.sample(6750, 550, false);
  assert(light.available() && light.screen(true) == 255 && light.lamp(true) == 0);
}
