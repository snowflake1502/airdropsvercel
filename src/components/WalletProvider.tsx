'use client'

import { FC, ReactNode, useMemo, useState, useEffect } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css'

interface WalletContextProviderProps {
  children: ReactNode
}

export const WalletContextProvider: FC<WalletContextProviderProps> = ({ children }) => {
  // Use mainnet-beta for production, devnet for testing
  const network = WalletAdapterNetwork.Mainnet
  
  // Force use of RPC proxy endpoint (keeps API keys secure)
  const [endpoint, setEndpoint] = useState<string>('https://api.mainnet-beta.solana.com')
  
  useEffect(() => {
    // Set proxy endpoint once window is available (client-side only)
    if (typeof window !== 'undefined') {
      const proxyUrl = `${window.location.origin}/api/rpc`
      setEndpoint(proxyUrl)
      console.log('✅ Using RPC proxy:', proxyUrl)
    }
  }, [])

  // Phantom is now a standard wallet and will be auto-detected
  // Only explicitly register Solflare for now
  const wallets = useMemo(
    () => [
      new SolflareWalletAdapter(),
    ],
    [network]
  )

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

