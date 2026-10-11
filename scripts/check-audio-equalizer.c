#include <assert.h>
#include <stdio.h>
#include "OpenfyEqualizer.h"

static double response(const double *packet, int length, double rate, double frequency) {
  OpenfyEqualizer eq;
  OpenfyEQConfigure(&eq, packet, length, rate);
  double inputPower = 0, outputPower = 0;
  for (int i = 0; i < (int)rate; i++) {
    float sample = (float)(0.03 * sin(6.283185307179586 * frequency * i / rate));
    float output = OpenfyEQSample(&eq, sample, 0);
    assert(isfinite(output));
    if (i > rate / 2) {
      inputPower += sample * sample;
      outputPower += output * output;
    }
  }
  return sqrt(outputPower / inputPower);
}

int main(void) {
  OpenfyEqualizer eq;
  const double neutral[] = { 1, 0 };
  OpenfyEQConfigure(&eq, neutral, 2, 48000);
  assert(fabs(OpenfyEQSample(&eq, 0.25f, 0) - 0.25) < 1e-6);
  assert(fabs(OpenfyEQSample(&eq, -0.75f, 1) + 0.75) < 1e-6);

  const double right[] = { 1, 1 };
  OpenfyEQConfigure(&eq, right, 2, 48000);
  assert(OpenfyEQSample(&eq, 0.5f, 0) == 0);
  assert(OpenfyEQSample(&eq, 0.5f, 1) == 0.5f);

  const double peak[] = { 0.4, 0, 1000, 6, 1, 0 };
  const double rates[] = { 32000, 44100, 48000, 96000 };
  for (int i = 0; i < 4; i++) {
    assert(fabs(response(peak, 6, rates[i], 1000) - 0.4 * pow(10, 6.0 / 20)) < 0.002);
    OpenfyEQConfigure(&eq, peak, 6, rates[i]);
    for (int sample = 0; sample < 1000; sample++) {
      OpenfyEQSample(&eq, sample == 0 ? 1 : 0, 0);
      assert(OpenfyEQSample(&eq, 0, 1) == 0);
    }
  }
  const double bass[] = { 0.4, 0, 250, 6, 0.7, 1 };
  const double treble[] = { 0.4, 0, 4000, 6, 0.7, 2 };
  assert(response(bass, 6, 48000, 40) > response(bass, 6, 48000, 8000) * 1.9);
  assert(response(treble, 6, 48000, 14000) > response(treble, 6, 48000, 100) * 1.9);
  puts("Audio equalizer: PCM response, rates, neutral, balance and channel isolation passed.");
  return 0;
}
