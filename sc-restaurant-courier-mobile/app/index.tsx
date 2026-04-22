import { Redirect } from 'expo-router';
import React from 'react';

import { useAuthStore } from '../src/store/auth-store';

export default function IndexScreen() {
  const token = useAuthStore((state) => state.token);
  return <Redirect href={token ? '/orders' : '/auth/sign-in'} />;
}
