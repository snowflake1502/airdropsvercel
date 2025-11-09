/**
 * RPC Configuration Helper
 * Ensures consistent RPC URL usage across the application
 * 
 * DEPRECATED: Use getRpcUrl from @/lib/env-config instead
 */

import { getRpcUrl as getRpcUrlFromEnv } from './env-config'

export function getRpcUrl(): string {
  return getRpcUrlFromEnv()
}

