import _appLabBoardPreparation from './app-lab-board-preparation.png';
import _genAiBanner from './gen-ai-banner.png';
import _genAiBannerBg from './gen-ai-banner-bg.png';
import _userAvatar from './user-avatar.png';

const appLabBoardPreparation = (
  <img src={_appLabBoardPreparation} alt="App Lab Board Preparation" />
);

const userAvatar = (
  <img src={_userAvatar} alt="User avatar" width="52" height="52" />
);
const genAiBanner = <img src={_genAiBanner} alt="Gen AI Banner" />;
const genAiBannerBg = (
  <img src={_genAiBannerBg} alt="Gen AI Banner Background" />
);

export { appLabBoardPreparation, genAiBanner, genAiBannerBg, userAvatar };
