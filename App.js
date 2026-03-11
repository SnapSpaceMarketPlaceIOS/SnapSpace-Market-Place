import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { StripeProvider } from '@stripe/stripe-react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LikedProvider } from './src/context/LikedContext';
import { SharedProvider } from './src/context/SharedContext';
import { CartProvider, useCart } from './src/context/CartContext';
import { OrderHistoryProvider } from './src/context/OrderHistoryContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Svg, { Path, Circle, Polyline, Line, Rect, G } from 'react-native-svg';
import { colors } from './src/constants/colors';
import { shadow, fontSize, fontWeight, radius } from './src/constants/tokens';

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
import HelpScreen from './src/screens/HelpScreen';
import RestorePurchaseScreen from './src/screens/RestorePurchaseScreen';
import RequestFeatureScreen from './src/screens/RequestFeatureScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import LanguageScreen from './src/screens/LanguageScreen';
import TermsOfUseScreen from './src/screens/TermsOfUseScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import VerifyEmailSentScreen from './src/screens/VerifyEmailSentScreen';
import SupplierApplicationScreen from './src/screens/SupplierApplicationScreen';
import SupplierApplicationStatusScreen from './src/screens/SupplierApplicationStatusScreen';
import AdminApplicationsScreen from './src/screens/AdminApplicationsScreen';
import AdminApplicationDetailScreen from './src/screens/AdminApplicationDetailScreen';
import SupplierOnboardingScreen from './src/screens/SupplierOnboardingScreen';
import SupplierDashboardScreen from './src/screens/SupplierDashboardScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Polyline points="9 22 9 12 15 12 15 22" />
    </Svg>
  );
}

function SearchIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={11} cy={11} r={8} />
      <Line x1={21} y1={21} x2={16.65} y2={16.65} />
    </Svg>
  );
}

// Frame 3 — full snap button SVG (ears + body + camera icon)
function Frame3Icon() {
  return (
    <Svg width={66} height={40} viewBox="0 0 80 49" fill="none">
      {/* Right dark-blue ear */}
      <Rect x={8} y={7} width={72} height={35} rx={10} fill="#035DA8" />
      {/* Left light-blue ear */}
      <Rect x={0} y={7} width={48} height={35} rx={10} fill="#67ACE9" />
      {/* Main black body */}
      <Rect x={4} y={0} width={72} height={49} rx={10} fill="black" />
      {/* Camera icon — centered at (39.5, 22.5) in the 80×49 canvas */}
      <G transform="translate(27.5, 10)">
        <Path
          d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
          fill="none"
          stroke="white"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={12} cy={13} r={4} fill="none" stroke="white" strokeWidth={1.8} />
      </G>
    </Svg>
  );
}

function CartIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Svg>
  );
}

function ProfileIcon({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx={12} cy={7} r={4} />
    </Svg>
  );
}

function SnapButton({ onPress }) {
  return (
    <View style={styles.snapWrap}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <Frame3Icon />
      </TouchableOpacity>
    </View>
  );
}

function CartBadge() {
  const { cartCount } = useCart();
  if (cartCount === 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
    </View>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.bluePrimary,
        tabBarInactiveTintColor: 'rgba(0,0,0,0.32)',
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarIcon: ({ color, size }) => <SearchIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Snap"
        component={SnapScreen}
        options={{
          tabBarButton: (props) => <SnapButton {...props} />,
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <View>
              <CartIcon color={color} size={size} />
              <CartBadge />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => <ProfileIcon color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.loadingWordmark}>SnapSpace</Text>
        <ActivityIndicator color="#0B6DC3" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* ── Full app always accessible (guests + logged-in users) ── */}
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
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY}>
      <SafeAreaProvider>
        <AuthProvider>
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
        </AuthProvider>
      </SafeAreaProvider>
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    height: 88,
    paddingTop: 6,
    // Subtle upward shadow per spec
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 4,
  },
  tabLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },
  snapWrap: {
    top: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    shadowColor: shadow.medium.shadowColor,
    shadowOffset: shadow.medium.shadowOffset,
    shadowOpacity: shadow.medium.shadowOpacity,
    shadowRadius: shadow.medium.shadowRadius,
    elevation: shadow.medium.elevation,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    backgroundColor: '#EF4444',
    width: 18,
    height: 18,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWordmark: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.6,
  },
});
