// SPDX-FileCopyrightText: Copyright (C) Arduino s.r.l. and/or its affiliated companies
//
// SPDX-License-Identifier: MPL-2.0

export const SKETCH_INO_TEMPLATE = [
  'void setup() {',
  '}',
  '',
  'void loop() {',
  '}',
  '',
].join('\n');

// The daemon refuses library calls on a sketch.yaml without a profile. Same
// content as the sketch.yaml the daemon writes for a new app.
export const SKETCH_YAML_TEMPLATE = [
  'profiles:',
  '  default:',
  '    platforms:',
  '      - platform: arduino:zephyr',
  '    libraries:',
  'default_profile: default',
  '',
].join('\n');
