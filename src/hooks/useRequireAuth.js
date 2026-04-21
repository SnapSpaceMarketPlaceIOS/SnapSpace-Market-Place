/**
 * useRequireAuth — Gate any user action behind authentication.
 *
 * Context (Build 69 Commit G): HomeGenie moved from a hard sign-in wall
 * (unauthenticated users saw nothing but AuthScreen) to a soft wall
 * (Home + Explore browseable, everything else requires an account).
 * This hook is the single chokepoint for "protected actions" on the
 * client side — tapping Add to Cart, Like, Follow, Generate, etc.
 *
 * Usage:
 *
 *   const requireAuth = useRequireAuth();
 *
 *   const handleLike = () => requireAuth(() => {
 *     toggleLike(productId);
 *   });
 *
 *   // Or inline:
 *   <TouchableOpacity onPress={() => requireAuth(handleAddToCart)}>
 *
 * Behavior:
 *   - If `user` is present, the wrapped action runs immediately.
 *   - If `user` is null, the hook navigates to the Auth screen (mounted
 *     in the root stack as `name="Auth"`). After successful sign-in,
 *     AuthContext updates `user`, which re-renders the previous screen
 *     but does NOT auto-run the deferred action — user may need to tap
 *     again. This is intentional: post-auth state transitions are
 *     subtle and re-running the action could surprise the user.
 *
 * IMPORTANT — this is UX gating, not security.
 *   The real access control is server-side: Supabase RLS on tables +
 *   JWT verification in edge functions. A determined attacker bypassing
 *   this client check still gets 401 from every backend call that
 *   matters. Keep that invariant true as the codebase evolves.
 */

import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

export function useRequireAuth() {
  const { user } = useAuth();
  const navigation = useNavigation();

  return useCallback(
    (action) => {
      if (user) {
        if (typeof action === 'function') action();
        return true;
      }
      // Not signed in — route to Auth. The AuthScreen is registered at
      // the root stack level (see App.js), so this navigate call works
      // from any depth.
      navigation.navigate('Auth');
      return false;
    },
    [user, navigation],
  );
}

export default useRequireAuth;
