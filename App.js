import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { useFonts } from 'expo-font';
import {
  KantumruyPro_400Regular,
  KantumruyPro_500Medium,
  KantumruyPro_600SemiBold,
  KantumruyPro_700Bold,
} from '@expo-google-fonts/kantumruy-pro';

import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LensLoader from './src/components/LensLoader';
import { LikedProvider } from './src/context/LikedContext';
import { SharedProvider } from './src/context/SharedContext';
import { CartProvider, useCart } from './src/context/CartContext';
import { OrderHistoryProvider } from './src/context/OrderHistoryContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SubscriptionProvider } from './src/context/SubscriptionContext';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg';
import { colors as C } from './src/constants/theme';
import { fontSize, fontWeight, radius } from './src/constants/tokens';

import HomeScreen from './src/screens/HomeScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import SnapScreen from './src/screens/SnapScreen';
import CartScreen from './src/screens/CartScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RoomResultScreen from './src/screens/RoomResultScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import AuthScreen from './src/screens/AuthScreen';
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
import VerifyEmailSentScreen from './src/screens/VerifyEmailSentScreen';
import SupplierApplicationScreen from './src/screens/SupplierApplicationScreen';
import AdminApplicationsScreen from './src/screens/AdminApplicationsScreen';
import AdminApplicationDetailScreen from './src/screens/AdminApplicationDetailScreen';
import SupplierOnboardingScreen from './src/screens/SupplierOnboardingScreen';
import SupplierDashboardScreen from './src/screens/SupplierDashboardScreen';
import BrowseScreen from './src/screens/BrowseScreen';
import AllCollectionsScreen from './src/screens/AllCollectionsScreen';
import PaywallScreen from './src/screens/PaywallScreen';
import FollowListScreen from './src/screens/FollowListScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ─── Figma spec constants ────────────────────────────────────────
const ICON_SIZE = 26;

// ─── Icons — matched to Figma "light" asset set ───────────────────

// Home_light: house outline with small arched window inside
function HomeIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 35 35" fill="none">
      <Path
        d="M4 15.5L17.5 4L31 15.5V30C31 30.55 30.55 31 30 31H22V23C22 22.45 21.55 22 21 22H14C13.45 22 13 22.45 13 23V31H5C4.45 31 4 30.55 4 30V15.5Z"
        stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M14 31V24H21V31"
        stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// Search_light: clean circle + angled handle
function SearchIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 31 32" fill="none">
      <Circle cx={13} cy={13} r={9} stroke={color} strokeWidth={1.6} />
      <Line x1={20} y1={20} x2={28} y2={28} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

// Camera: rounded rect body + bump + circle lens
function CameraIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 31" fill="none">
      <Path
        d="M2 10C2 8.9 2.9 8 4 8H8.5L10.5 5H21.5L23.5 8H28C29.1 8 30 8.9 30 10V26C30 27.1 29.1 28 28 28H4C2.9 28 2 27.1 2 26V10Z"
        stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      />
      <Circle cx={16} cy={18} r={5} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

// Basket_alt_3_light: shopping cart with angled handle + 2 wheels
function CartIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 35 32" fill="none">
      <Path
        d="M1 1H6L9 20H27L30 8H6"
        stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      />
      <Circle cx={12} cy={27} r={2} stroke={color} strokeWidth={1.6} />
      <Circle cx={25} cy={27} r={2} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

// User_cicrle_light: person silhouette inside outer circle
function ProfileIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 29" fill="none">
      <Circle cx={15} cy={14.5} r={13} stroke={color} strokeWidth={1.6} />
      <Circle cx={15} cy={11} r={4} stroke={color} strokeWidth={1.6} />
      <Path
        d="M7 25C7.5 20.5 10.5 18 15 18C19.5 18 22.5 20.5 23 25"
        stroke={color} strokeWidth={1.6} strokeLinecap="round"
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

// ─── Animated tab button — subtle scale bounce on press ──────────
function AnimatedTabButton({ children, onPress, style, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;
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
      <Animated.View style={{ transform: [{ scale }], alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ─── Tab Navigator ───────────────────────────────────────────────
function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#0B6DC3',
        tabBarInactiveTintColor: '#111827',
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          fontFamily: 'KantumruyPro_500Medium',
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingTop: 4,
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
        options={{
          tabBarIcon: ({ color }) => <SearchIcon color={color} size={ICON_SIZE} />,
        }}
      />
      <Tab.Screen
        name="Snap"
        component={SnapScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <View style={{ position: 'relative' }}>
              <CameraIcon color={color} size={ICON_SIZE} />
              <View style={{ position: 'absolute', top: -4, right: -4 }}>
                <Svg width={10} height={10} viewBox="0 0 8 8" fill="none">
                  {/* 4-pointed AI sparkle star */}
                  <Path
                    d="M4 0 L5 3 L8 4 L5 5 L4 8 L3 5 L0 4 L3 3 Z"
                    fill="#0B6DC3"
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
        options={{
          tabBarIcon: ({ color }) => <ProfileIcon color={color} size={ICON_SIZE} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Root Navigator ──────────────────────────────────────────────
function RootNavigator() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.loadingWordmark}>HomeGenie</Text>
        <LensLoader size={48} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={TabNavigator} />
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="VerifyEmailSent" component={VerifyEmailSentScreen} />
      <Stack.Screen name="RoomResult" component={RoomResultScreen} />
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
    KantumruyPro_400Regular,
    KantumruyPro_500Medium,
    KantumruyPro_600SemiBold,
    KantumruyPro_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={{ fontSize: 32, fontWeight: '800', color: '#111827', letterSpacing: -0.6 }}>
          HomeGenie
        </Text>
        <LensLoader size={48} style={{ marginTop: 24 }} />
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
                <NavigationContainer>
                  <RootNavigator />
                </NavigationContainer>
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
    borderTopColor: 'rgba(0,0,0,0.08)',
    height: 82,
    paddingTop: 10,
    paddingBottom: 0,
  },

  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: C.destructive,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  badgeText: {
    color: C.white,
    fontSize: 9,
    fontWeight: fontWeight.bold,
    fontFamily: 'KantumruyPro_700Bold',
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWordmark: {
    fontSize: 32,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.6,
    fontFamily: 'KantumruyPro_700Bold',
  },
});
