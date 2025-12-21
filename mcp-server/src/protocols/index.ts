/**
 * Protocol Registry
 * Manages all protocol implementations
 */

import { Connection } from '@solana/web3.js'
import { BaseProtocol } from './base-protocol'
import { MeteoraProtocol } from './meteora'
import { JupiterProtocol } from './jupiter'
import { SanctumProtocol } from './sanctum'

export class ProtocolRegistry {
  private protocols: Map<string, BaseProtocol>
  private connection: Connection

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed')
    this.protocols = new Map()

    // Register protocols
    this.registerProtocol('meteora', new MeteoraProtocol(this.connection))
    this.registerProtocol('jupiter', new JupiterProtocol(this.connection))
    this.registerProtocol('sanctum', new SanctumProtocol(this.connection))
  }

  /**
   * Register a protocol implementation
   */
  registerProtocol(name: string, protocol: BaseProtocol): void {
    this.protocols.set(name.toLowerCase(), protocol)
  }

  /**
   * Get a protocol by name
   */
  getProtocol(name: string): BaseProtocol | undefined {
    return this.protocols.get(name.toLowerCase())
  }

  /**
   * Get all registered protocols
   */
  getAllProtocols(): BaseProtocol[] {
    return Array.from(this.protocols.values())
  }

  /**
   * Get list of protocol names
   */
  getProtocolNames(): string[] {
    return Array.from(this.protocols.keys())
  }
}

