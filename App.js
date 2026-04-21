import React, { useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, LogBox } from 'react-native';
import { lockPortrait } from './src/utils/orientation';
import { useFonts } from 'expo-font';

// Silence known-harmless dev-mode warnings that LogBox promotes to red
// error boxes. The orientation entry hides the 'Cannot find native
// module ExpoScreenOrientation' trace that fires on the current
// dev-client build — our try/catch in src/utils/orientation.js already
// handles this gracefully, but LogBox's global error hook picks it up
// anyway and blocks the UI with a red modal every launch. Once the dev
// client is rebuilt with the expo-screen-orientation pod linked, the
// warning stops firing and this entry is a no-op.
LogBox.ignoreLogs([
  "Cannot find native module 'ExpoScreenOrientation'",
  '[Orientation] expo-screen-orientation native module not linked',
]);
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist';

import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LensLoader from './src/components/LensLoader';
import GenieLoader from './src/components/GenieLoader';
import { LikedProvider } from './src/context/LikedContext';
import { SharedProvider } from './src/context/SharedContext';
import { CartProvider, useCart } from './src/context/CartContext';
import { OrderHistoryProvider } from './src/context/OrderHistoryContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SubscriptionProvider } from './src/context/SubscriptionContext';
import { OnboardingProvider } from './src/context/OnboardingContext';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Svg, { Path, Circle, Polyline, Line, Ellipse } from 'react-native-svg';
import { colors as C } from './src/constants/theme';
import { fontSize, fontWeight, radius, layout, space, typeScale, palette } from './src/constants/tokens';

import HomeScreen from './src/screens/HomeScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import SnapScreen from './src/screens/SnapScreen';
import CartScreen from './src/screens/CartScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RoomResultScreen from './src/screens/RoomResultScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import LikedScreen from './src/screens/LikedScreen';
import SharedScreen from './src/screens/SharedScreen';
import ShopTheLookScreen from './src/screens/ShopTheLookScreen';
import OrderHistoryScreen from './src/screens/OrderHistoryScreen';
import PaymentMethodsScreen from './src/screens/PaymentMethodsScreen';
import MySpacesScreen from './src/screens/MySpacesScreen';
import HelpScreen from './src/screens/HelpScreen';
import RestorePurchaseScreen from './src/screens/RestorePurchaseScreen';
import RequestFeatureScreen from './src/screens/RequestFeatureScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import LanguageScreen from './src/screens/LanguageScreen';
import TermsOfUseScreen from './src/screens/TermsOfUseScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import AuthScreen from './src/screens/AuthScreen';
import VerifyEmailSentScreen from './src/screens/VerifyEmailSentScreen';
import SupplierApplicationScreen from './src/screens/SupplierApplicationScreen';
import SupplierApplicationStatusScreen from './src/screens/SupplierApplicationStatusScreen';
import AdminApplicationsScreen from './src/screens/AdminApplicationsScreen';
import AdminApplicationDetailScreen from './src/screens/AdminApplicationDetailScreen';
import SupplierOnboardingScreen from './src/screens/SupplierOnboardingScreen';
import SupplierDashboardScreen from './src/screens/SupplierDashboardScreen';
import BrowseScreen from './src/screens/BrowseScreen';
import AllCollectionsScreen from './src/screens/AllCollectionsScreen';
import PaywallScreen from './src/screens/PaywallScreen';
import FollowListScreen from './src/screens/FollowListScreen';
import ConsentModal from './src/components/ConsentModal';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ─── Figma spec constants ────────────────────────────────────────
const ICON_SIZE = 26;

// ─── Tab Bar Icons (from Navigation Bar Icons.svg) ──────────────

// Home: house with peaked roof + rounded-corner door
function HomeIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="95 20.5 23 23" fill="none">
      <Path
        d="M96 31.8422C96 30.0656 96 29.1773 96.4117 28.3964C96.8234 27.6156 97.5965 27.0375 99.1429 25.8813L100.643 24.7597C103.438 22.6698 104.835 21.6249 106.5 21.6249C108.165 21.6249 109.562 22.6698 112.357 24.7597L113.857 25.8813C115.403 27.0375 116.177 27.6156 116.588 28.3964C117 29.1773 117 30.0656 117 31.8422V37.3908C117 39.8582 117 41.0919 116.121 41.8584C115.243 42.6249 113.828 42.6249 111 42.6249H102C99.1716 42.6249 97.7574 42.6249 96.8787 41.8584C96 41.0919 96 39.8582 96 37.3908V31.8422Z"
        stroke={color} strokeWidth={1}
      />
      <Path
        d="M110.146 42.625V34.875C110.146 34.3227 109.698 33.875 109.146 33.875H103.854C103.302 33.875 102.854 34.3227 102.854 34.875V42.625"
        stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// Explore: oval magnifying glass + angled handle
function SearchIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="154 21.5 22 22" fill="none">
      <Ellipse cx={163.208} cy={30.6666} rx={7.75} ry={8} stroke={color} strokeWidth={1} />
      <Path d="M174.833 42.6666L170.958 38.6666" stroke={color} strokeWidth={1} strokeLinecap="round" />
    </Svg>
  );
}

// Snap: camera body + circular lens (sparkle added as overlay in tab options)
function CameraIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="208 21 26 23" fill="none">
      <Path
        d="M209 29.819C209 28.4462 210.113 27.3333 211.486 27.3333C212.416 27.3333 213.268 26.8141 213.695 25.9876L214.778 23.8888C215.098 23.2694 215.257 22.9596 215.491 22.7324C215.706 22.5234 215.966 22.3654 216.25 22.2702C216.559 22.1666 216.908 22.1666 217.605 22.1666H224.395C225.092 22.1666 225.441 22.1666 225.75 22.2702C226.034 22.3654 226.294 22.5234 226.509 22.7324C226.743 22.9596 226.902 23.2694 227.222 23.8888L228.305 25.9876C228.732 26.8141 229.584 27.3333 230.514 27.3333C231.887 27.3333 233 28.4462 233 29.819V36.8333C233 39.6617 233 41.0759 232.121 41.9546C231.243 42.8333 229.828 42.8333 227 42.8333H215C212.172 42.8333 210.757 42.8333 209.879 41.9546C209 41.0759 209 39.6617 209 36.8333V29.819Z"
        stroke={color} strokeWidth={1}
      />
      <Path
        d="M221 29.125C223.684 29.125 225.834 31.2295 225.834 33.792C225.833 36.3543 223.684 38.458 221 38.458C218.315 38.4578 216.167 36.3542 216.167 33.792C216.167 31.2296 218.315 29.1252 221 29.125Z"
        stroke={color} strokeWidth={1}
      />
    </Svg>
  );
}

// Cart: angled trolley with handle + body + wheels
function CartIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="265.5 20.5 27 25" fill="none">
      <Path
        d="M267.104 22H270.08C270.756 22 271.094 22 271.353 22.1807C271.611 22.3614 271.727 22.6792 271.959 23.3149L272.937 26"
        stroke={color} strokeWidth={1} strokeLinecap="round"
      />
      <Path
        d="M287.521 39.3334H273.63C272.984 39.3334 272.661 39.3334 272.442 39.218C272.156 39.0675 271.961 38.7883 271.917 38.4684C271.884 38.2233 271.995 37.9197 272.216 37.3126C272.448 36.675 272.565 36.3562 272.755 36.1102C273.003 35.789 273.343 35.551 273.73 35.4278C274.026 35.3334 274.365 35.3334 275.044 35.3334H283.146"
        stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M283.846 35.3333H276.939C275.703 35.3333 275.085 35.3333 274.594 35.0212C274.103 34.7091 273.841 34.1497 273.317 33.0311L272.024 30.2733C271.123 28.3515 270.673 27.3906 271.115 26.6953C271.557 26 272.618 26 274.74 26H286.483C288.876 26 290.073 26 290.501 26.7728C290.93 27.5457 290.296 28.5605 289.027 30.59L287.238 33.4533C286.663 34.3724 286.376 34.8319 285.924 35.0826C285.471 35.3333 284.929 35.3333 283.846 35.3333Z"
        stroke={color} strokeWidth={1} strokeLinecap="round"
      />
      <Ellipse cx={286.792} cy={42.6667} rx={1.45833} ry={1.33333} fill={color} />
      <Ellipse cx={275.125} cy={42.6667} rx={1.45833} ry={1.33333} fill={color} />
    </Svg>
  );
}

// Profile: head + body circle + shoulders arc
function ProfileIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="325 20.5 24 24" fill="none">
      <Ellipse cx={337} cy={30.0834} rx={3.75} ry={3.625} stroke={color} strokeWidth={1} strokeLinecap="round" />
      <Ellipse cx={337} cy={32.5} rx={11.25} ry={10.875} stroke={color} strokeWidth={1} />
      <Path
        d="M344.5 40.603C344.058 39.3183 343.083 38.1831 341.727 37.3735C340.371 36.5639 338.709 36.125 337 36.125C335.291 36.125 333.629 36.5639 332.273 37.3735C330.917 38.1831 329.942 39.3183 329.5 40.603"
        stroke={color} strokeWidth={1} strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Cart badge ──────────────────────────────────────────────────
function CartBadge() {
  const { cartCount } = useCart();
  if (cartCount === 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
    </View>
  );
}

// ─── Animated tab button — scale bounce on press + active indicator ─
function AnimatedTabButton({ children, onPress, style, accessibilityState, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;
  const isFocused = accessibilityState?.selected ?? false;
  const indicatorOpacity = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const indicatorScaleX = useRef(new Animated.Value(isFocused ? 1 : 0.3)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(indicatorOpacity, {
        toValue: isFocused ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(indicatorScaleX, {
        toValue: isFocused ? 1 : 0.3,
        speed: 32,
        bounciness: 6,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isFocused]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, []);
  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
  }, []);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={style}
      {...rest}
    >
      {/* Active indicator pill — top of tab, springs in on focus */}
      <View style={styles.tabIndicatorWrap} pointerEvents="none">
        <Animated.View
          style={[
            styles.tabIndicator,
            { opacity: indicatorOpacity, transform: [{ scaleX: indicatorScaleX }] },
          ]}
        />
      </View>
      <Animated.View style={{ transform: [{ scale }], alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ─── Tab Navigator ───────────────────────────────────────────────
function TabNavigator() {
  // Build 69 Commit G: soft auth wall.
  // Logged-out users can browse ONLY the Home tab. Tapping Explore,
  // Wish, Cart, or Profile → intercepted below and redirects to
  // AuthScreen (mounted in the root stack). Explore was originally
  // planned as public but was gated too because its design cards
  // rely on author info which RLS restricts to authenticated users —
  // showing blank/placeholder author fields could read as broken to
  // both real users and App Review, so we gate the whole tab instead.
  // See useRequireAuth for action-level gating used by individual
  // screens (like/share/add-to-cart, etc.).
  const { user } = useAuth();

  // Factory for the gated-tab listener. Each gated Tab.Screen wires this
  // to `listeners={...}` so a single signed-out tap preventDefaults the
  // tab switch and navigates to Auth instead.
  const gatedTabListener = ({ navigation: tabNav }) => ({
    tabPress: (e) => {
      if (!user) {
        e.preventDefault();
        tabNav.getParent()?.navigate('Auth');
      }
    },
  });

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        lazy: true,
        // Keep visited tab screens warm in memory but pause their render loop
        // while blurred. Eliminates the gray-flash / image re-decode that happens
        // when navigating back to a previously-visited tab. First visit still
        // goes through lazy mount.
        freezeOnBlur: true,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textPrimary,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          ...typeScale.tabLabel,
          fontFamily: 'Geist_500Medium',
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingTop: space.xs,
          paddingBottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarButton: (props) => <AnimatedTabButton {...props} />,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color }) => <HomeIcon color={color} size={ICON_SIZE} />,
        }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        listeners={gatedTabListener}
        options={{
          tabBarIcon: ({ color }) => <SearchIcon color={color} size={ICON_SIZE} />,
        }}
      />
      <Tab.Screen
        name="Wish"
        component={SnapScreen}
        listeners={gatedTabListener}
        options={{
          tabBarIcon: ({ color }) => (
            <View style={{ position: 'relative' }}>
              <CameraIcon color={color} size={ICON_SIZE} />
              <View style={{ position: 'absolute', top: -5, right: -6 }}>
                <Svg width={12} height={14} viewBox="0 0 8 10" fill="none">
                  {/* 4-pointed AI sparkle star (from design SVG) */}
                  <Path
                    d="M4 0L4.891 3.796L8 4.819L5.098 5.635L4 9.886L2.939 5.635L0 4.819L3.076 3.796L4 0Z"
                    fill={C.primary}
                  />
                </Svg>
              </View>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        listeners={gatedTabListener}
        options={{
          tabBarIcon: ({ color }) => (
            <View>
              <CartIcon color={color} size={ICON_SIZE} />
              <CartBadge />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        listeners={gatedTabListener}
        options={{
          tabBarIcon: ({ color }) => <ProfileIcon color={color} size={ICON_SIZE} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Root Navigator ──────────────────────────────────────────────
function RootNavigator() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.loadingWordmark}>HomeGenie</Text>
        <GenieLoader size={80} animating style={{ marginTop: 48 }} />
      </View>
    );
  }

  // Build 69 Commit G: soft auth wall.
  //
  // Previously (Build 34): a hard wall kept unauthenticated users on
  // AuthScreen with no access to any app content. We've flipped to a
  // freemium-browse model — the Home tab is open to everyone, and
  // any gated action (tapping Explore/Wish/Cart/Profile tabs, tapping
  // Add to Cart, Like, Follow, Generate, etc.) routes here to Auth.
  //
  // AuthScreen is now part of the main stack, presented as a modal so
  // users can dismiss it and continue browsing. See useRequireAuth
  // (src/hooks/useRequireAuth.js) for how actions gate themselves,
  // and the TabNavigator's `listeners={gatedTabListener}` blocks above
  // for tab-level gating.
  //
  // The loading screen above still runs on first app launch while
  // AuthContext bootstraps from AsyncStorage — that behavior is
  // unchanged and necessary to avoid a brief flash of "signed out" UI
  // for users whose session is already persisted.

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animationDuration: 300,
        // Paint the card bg white during stack transitions. Without this,
        // iOS briefly shows black between screens on back-navigation (the
        // native stack container defaults to no bg), which was visible as
        // a ~100ms black flash when popping from ProductDetail → Home.
        contentStyle: { backgroundColor: '#FFFFFF' },
      }}
    >
      <Stack.Screen name="Main" component={TabNavigator} />
      {/* Build 69 Commit G: Auth screens always mounted so soft-wall
          gates can navigate here from anywhere. Presented as a modal so
          users can X-close and resume browsing. */}
      <Stack.Screen
        name="Auth"
        component={AuthScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="VerifyEmailSent" component={VerifyEmailSentScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="RoomResult" component={RoomResultScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="ShopTheLook" component={ShopTheLookScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="Liked" component={LikedScreen} />
      <Stack.Screen name="Shared" component={SharedScreen} />
      <Stack.Screen name="OrderHistory" component={OrderHistoryScreen} />
      <Stack.Screen name="MySpaces" component={MySpacesScreen} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="RestorePurchase" component={RestorePurchaseScreen} />
      <Stack.Screen name="RequestFeature" component={RequestFeatureScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Language" component={LanguageScreen} />
      <Stack.Screen name="TermsOfUse" component={TermsOfUseScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="SupplierApplication" component={SupplierApplicationScreen} />
      <Stack.Screen name="SupplierApplicationStatus" component={SupplierApplicationStatusScreen} />
      <Stack.Screen name="AdminApplications" component={AdminApplicationsScreen} />
      <Stack.Screen name="AdminApplicationDetail" component={AdminApplicationDetailScreen} />
      <Stack.Screen name="SupplierOnboarding" component={SupplierOnboardingScreen} />
      <Stack.Screen name="SupplierDashboard" component={SupplierDashboardScreen} />
      <Stack.Screen name="Browse" component={BrowseScreen} />
      <Stack.Screen name="AllCollections" component={AllCollectionsScreen} />
      <Stack.Screen name="Paywall" component={PaywallScreen} options={{ presentation: 'transparentModal', headerShown: false }} />
      <Stack.Screen name="FollowList" component={FollowListScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
  });

  // app.json sets orientation to "default" (allows rotation natively) so the
  // camera screen can unlock to landscape. Every other screen in the app
  // assumes portrait layout, so we lock globally here at startup. SnapScreen
  // unlocks on focus and re-locks on blur — see its useFocusEffect.
  //
  // lockPortrait is a safe wrapper: if expo-screen-orientation's native
  // module isn't linked into this build (stale dev client), the call is a
  // no-op and the app still boots. Once rebuilt, it activates automatically.
  useEffect(() => {
    lockPortrait();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.loadingWordmark}>
          HomeGenie
        </Text>
        <GenieLoader size={80} animating style={{ marginTop: 48 }} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SubscriptionProvider>
        <CartProvider>
          <OrderHistoryProvider>
            <LikedProvider>
              <SharedProvider>
                <OnboardingProvider>
                  <NavigationContainer>
                    <RootNavigator />
                    <ConsentModal />
                  </NavigationContainer>
                </OnboardingProvider>
              </SharedProvider>
            </LikedProvider>
          </OrderHistoryProvider>
        </CartProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// ─── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 0.5,
    borderTopColor: palette.borderLight,
    height: layout.tabBarHeight,
    paddingTop: 6,
    paddingBottom: 0,
  },

  tabIndicatorWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tabIndicator: {
    width: 20,
    height: 2,
    borderRadius: 2,
    backgroundColor: C.primary,
  },

  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: C.primary,
    width: space.base,
    height: space.base,
    borderRadius: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  badgeText: {
    ...typeScale.badge,
    color: C.white,
    fontFamily: 'Geist_700Bold',
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWordmark: {
    ...typeScale.wordmark,
    color: C.textPrimary,
  },
});
