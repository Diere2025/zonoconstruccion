"use client";

import { createContext, useContext } from 'react';
import type { ErpModule } from '@/lib/erpNavigation';

export const ErpNavigationContext = createContext<{
  modules: ErpModule[];
  ready: boolean;
  error: string;
}>({ modules: [], ready: false, error: '' });

export function useErpNavigation() {
  return useContext(ErpNavigationContext);
}
