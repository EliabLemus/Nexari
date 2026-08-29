import { Vivari } from '@vivari/core';
import type { VivariSdk } from '../src/index.js';

const ownedForkSdk: VivariSdk = {
  boot: (options) => Vivari.boot(options),
};

void ownedForkSdk;
