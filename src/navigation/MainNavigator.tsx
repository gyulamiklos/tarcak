import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AssetTypesScreen from '../screens/AssetTypesScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import HistoryScreen from '../screens/HistoryScreen';
import HomeScreen from '../screens/HomeScreen';
import JarAdvancedAssetEditor from '../screens/JarAdvancedAssetEditor';
import JarAdvancedHub from '../screens/JarAdvancedHub';
import JarScreen from '../screens/JarScreen';
import JarSplitScreen from '../screens/JarSplitScreen';
import PocketDetailScreen from '../screens/PocketDetailScreen';
import PocketsScreen from '../screens/PocketsScreen';
import ReportExportScreen from '../screens/ReportExportScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StatisticsMonthScreen from '../screens/StatisticsMonthScreen';
import StatisticsScreen from '../screens/StatisticsScreen';
import TransactionEditorScreen from '../screens/TransactionEditorScreen';
import { useAppTheme } from '../theme/ThemeContext';
import { font } from '../theme/fonts';
import { LockVaultContext } from './LockVaultContext';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function MainNavigator({ onLockVault }: { onLockVault: () => Promise<void> }) {
  return (
    <LockVaultContext.Provider value={onLockVault}>
      <MainStack />
    </LockVaultContext.Provider>
  );
}

function MainStack() {
  const { colors, isDark, navTheme } = useAppTheme();

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontFamily: font.semibold, color: colors.text },
          headerBackTitleStyle: { fontFamily: font.regular },
          headerShadowVisible: !isDark,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Tarcak' }} />
        <Stack.Screen name="Jar" component={JarScreen} options={{ title: 'Jar' }} />
        <Stack.Screen name="JarSplit" component={JarSplitScreen} options={{ title: 'Jar split' }} />
        <Stack.Screen name="JarAdvanced" component={JarAdvancedHub} options={{ title: 'Advanced Jar' }} />
        <Stack.Screen
          name="JarAdvancedAssetEditor"
          component={JarAdvancedAssetEditor}
          options={({ route }) => ({
            title: route.params?.currency ? `Jar: ${route.params.currency}` : 'Advanced asset',
          })}
        />
        <Stack.Screen name="Pockets" component={PocketsScreen} options={{ title: 'Pockets' }} />
        <Stack.Screen
          name="PocketDetail"
          component={PocketDetailScreen}
          options={{ title: 'Pocket' }}
        />
        <Stack.Screen
          name="TransactionEditor"
          component={TransactionEditorScreen}
          options={{ title: 'Transaction' }}
        />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
        <Stack.Screen name="Statistics" component={StatisticsScreen} options={{ title: 'Statistics' }} />
        <Stack.Screen name="StatisticsMonth" component={StatisticsMonthScreen} options={{ title: 'Month' }} />
        <Stack.Screen
          name="ReportExport"
          component={ReportExportScreen}
          options={{ title: 'Export report' }}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        <Stack.Screen
          name="AssetTypes"
          component={AssetTypesScreen}
          options={{ title: 'Asset types' }}
        />
        <Stack.Screen
          name="Categories"
          component={CategoriesScreen}
          options={{ title: 'Categories' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
