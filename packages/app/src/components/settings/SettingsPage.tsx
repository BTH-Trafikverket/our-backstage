import { UserSettingsPage } from '@backstage/plugin-user-settings';
import { XpLevelCard } from '@internal/backstage-plugin-backstage-plugin-gamification';

export const SettingsPage = () => {
  return (
    <>
      <div style={{ padding: 16, fontSize: 24, border: '2px solid red' }}>
        SETTINGS PAGE TEST ✅
      </div>

      <UserSettingsPage />
      <XpLevelCard />
      <UserSettingsPage />
    </>
  );
};
