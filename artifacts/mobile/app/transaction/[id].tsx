import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Empty transaction placeholder if needed
export default function TransactionDetailScreen() {
  return (
    <View style={styles.container}>
      <Text>Transaction Detail</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});