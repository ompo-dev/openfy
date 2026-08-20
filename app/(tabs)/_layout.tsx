import { Tabs } from 'expo-router';
import { BottomTabBar } from '@navigators';

export default function Layout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: '#121212',
        },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
      tabBar={(props: any) => <BottomTabBar {...props} />}
    >
      <Tabs.Screen name="home" options={{ headerShown: false }} />
      <Tabs.Screen name="library" options={{ headerShown: false }} />
    </Tabs>
  );
}
