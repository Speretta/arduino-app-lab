import { Config } from '@cloud-editor-mono/common';

// ** the below is "borrowed" from the Arduino `cloud-website` repo
interface DeploymentPath {
  /** The custom 4th level domain, used for customization purposes */
  customKey: string | undefined;
  /** The root of the application, adapted to the environment (used for external redirection on the same environment domain) */
  extRoot: string;
}

/**
 * The deployment path configuration, calculated at runtime.
 */
export const deploymentPath: DeploymentPath = ((): DeploymentPath => {
  // Match `<key>.app.<domain>.cc` for any Arduino environment
  // based on the runtime hostname alone: the build-time
  // VITE_DOMAIN may not match the domain the app is actually served from
  // (e.g. the production component bundle running on a staging domain),
  // which would wrongly leave `customKey` undefined on custom domains.
  const match = window.location.hostname.match(
    /^(?:([^.]+)\.)?app\.(arduino|oniudra)\.cc$/,
  );

  return {
    // If we are on an Arduino domain, check if it's a custom one.
    customKey: match?.[1] || undefined,
    // If we're not running on a real Arduino domain, use the VITE_DOMAIN environment variable. Else, we can simply use the current origin.
    extRoot: match ? window.location.origin : `https://app.${Config.DOMAIN}.cc`,
  };
})();
