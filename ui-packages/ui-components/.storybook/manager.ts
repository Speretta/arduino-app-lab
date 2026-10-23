import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';
 
addons.setConfig({
  theme: create({
    base: 'dark',
    // brandTitle: 'My custom Storybook',
    brandUrl: 'https://github.com/arduino/arduino-app-lab',
    brandImage: '/brand-storybook-arduino.png',
    brandTarget: '_blank',
  }),
});
