import { Tabs } from 'expo-router/js-tabs';

import { InboxTabBar } from '../../src/components/TabBar';
import { copy } from '../../src/copy';

/**
 * The five-tab shell (docs/design/card-feed/README.md:32-35; the Questions tab, M10 plan Q decision
 * Q11). The order of the screens below is
 * the order of the tabs. Each screen draws its own title, so the navigator shows no header.
 */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <InboxTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: copy.tabs.today }} />
      <Tabs.Screen name="tree" options={{ title: copy.tabs.tree }} />
      <Tabs.Screen name="explore" options={{ title: copy.tabs.explore }} />
      <Tabs.Screen name="questions" options={{ title: copy.qa.tab }} />
      <Tabs.Screen name="profile" options={{ title: copy.tabs.profile }} />
    </Tabs>
  );
}
