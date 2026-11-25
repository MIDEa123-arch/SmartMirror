#pragma once

#include <stdint.h>

class MirrorLighting {
 public:
  void sample(uint32_t now, int raw, bool dark) {
    // Unplugged module: AO pulled down, DO pulled up. Allow valid extremes.
    const bool valid = dark ? raw >= 24 : raw <= 4070;
    if (available_ && now - lastValid_ >= 2000) {
      available_ = false;
      darkRoom_ = false;
      switchSamples_ = 0;
    }
    if (!valid) {
      switchSamples_ = 0;
      return;
    }

    filtered_ = available_ ? filtered_ + (raw - filtered_) * 0.25f : raw;
    lastValid_ = now;
    available_ = true;
    // Use the module's adjustable DO threshold. Reject isolated transitions.
    if (dark == darkRoom_) {
      switchSamples_ = 0;
    } else if (++switchSamples_ >= 3) {
      darkRoom_ = dark;
      switchSamples_ = 0;
    }
  }

  bool available() const { return available_; }

  int screen(bool active) const {
    if (!active) return 0;
    if (!available_) return 96;
    return 255 - darkness() * (255 - 64) / 1950;
  }

  int lamp(bool active) const {
    if (!active || !available_ || !darkRoom_) return 0;
    return 64 + darkness() * (255 - 64) / 1950;
  }

 private:
  int darkness() const {
    // Nominal AO range: 550 (bright) to 2500 (dark), 12-bit ADC.
    const int offset = static_cast<int>(filtered_ + 0.5f) - 550;
    return offset < 0 ? 0 : offset > 1950 ? 1950 : offset;
  }

  bool available_ = false;
  bool darkRoom_ = false;
  unsigned switchSamples_ = 0;
  uint32_t lastValid_ = 0;
  float filtered_ = 0;
};
