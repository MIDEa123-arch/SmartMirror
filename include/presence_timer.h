#pragma once
#include <stdint.h>

class PresenceTimer {
 public:
  void startTrial(uint32_t now) {
    startedAt_ = now;
    duration_ = 30000;
  }

  void confirm(uint32_t now) {
    startedAt_ = now;
    duration_ = 600000;
  }

  bool expired(uint32_t now) const {
    return now - startedAt_ >= duration_;
  }

 private:
  uint32_t startedAt_ = 0;
  uint32_t duration_ = 0;
};
