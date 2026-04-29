/**
 * PurchaseCelebrationOverlay.js — passive observer of celebration triggers.
 *
 * Mounted as the last child of PaywallScreen, absolutely positioned over
 * the entire screen with pointerEvents="none" so it never intercepts
 * taps. Watches the auth+subscription context for two transitions:
 *
 *   1. `tokenBalance` increases → wish-pack purchase succeeded
 *   2. `subscription.tier` changes from 'free' to a paid tier → sub purchase succeeded
 *
 * On either trigger, mounts a SparkleBurst at the supplied `origin` point
 * (the on-screen center of the tile the user just purchased). Multiple
 * concurrent bursts are supported (rare, but harmless).
 *
 * CRITICAL: this component reads context state but never writes to it,
 * never dispatches anything, never imports the purchase RPCs. The actual
 * purchase pipeline (SubscriptionContext listener → validateReceipt edge
 * fn → add_tokens RPC → setTokenBalance) is completely untouched. By the
 * time this overlay sees the balance change, the receipt has already
 * been validated and the wish credit is durable. The animation is
 * cosmetic feedback on a state change that already happened.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSubscription } from '../../context/SubscriptionContext';
import SparkleBurst from './SparkleBurst';

export default function PurchaseCelebrationOverlay({ origin }) {
  const { tokenBalance, subscription } = useSubscription();
  const [bursts, setBursts] = useState([]);
  const prevBalanceRef = useRef(tokenBalance);
  const prevTierRef    = useRef(subscription?.tier);

  useEffect(() => {
    const prevBal = prevBalanceRef.current;
    if (
      typeof tokenBalance === 'number' &&
      typeof prevBal === 'number' &&
      tokenBalance > prevBal &&
      origin
    ) {
      // Balance bumped — fire a burst. id = timestamp so concurrent bursts
      // (extremely rare) get unique React keys.
      const id = Date.now() + Math.random();
      setBursts((prev) => [...prev, { id, x: origin.x, y: origin.y }]);
    }
    prevBalanceRef.current = tokenBalance;
  }, [tokenBalance, origin]);

  useEffect(() => {
    const prevTier = prevTierRef.current;
    const tier     = subscription?.tier;
    // Free → paid transition is the only one that should celebrate.
    // Tier upgrades within the paid plans (basic → pro → premium) also
    // count, but renewals or downgrades do not.
    const isUpgrade =
      prevTier === 'free' && tier && tier !== 'free';
    const isCrossTierUpgrade =
      prevTier && tier &&
      prevTier !== 'free' && tier !== 'free' && prevTier !== tier;
    if ((isUpgrade || isCrossTierUpgrade) && origin) {
      const id = Date.now() + Math.random();
      setBursts((prev) => [...prev, { id, x: origin.x, y: origin.y }]);
    }
    prevTierRef.current = tier;
  }, [subscription?.tier, origin]);

  const handleComplete = (id) => {
    setBursts((prev) => prev.filter((b) => b.id !== id));
  };

  if (bursts.length === 0) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bursts.map((b) => (
        <SparkleBurst
          key={b.id}
          x={b.x}
          y={b.y}
          onComplete={() => handleComplete(b.id)}
        />
      ))}
    </View>
  );
}
