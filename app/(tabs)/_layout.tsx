import { Tabs } from 'expo-router';
import { BottomTabBar } from '@navigators';

export default function Layout() {
  return (
    <Tabs tabBar={(props: any) => <BottomTabBar {...props} />}>
      <Tabs.Screen name="home" options={{ headerShown: false }} />
      <Tabs.Screen name="library" options={{ headerShown: false }} />
    </Tabs>
  );
}
