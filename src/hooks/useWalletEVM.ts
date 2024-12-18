import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { TOKEN_ABI } from '../contracts/abis/Token';
import { SUPPORTED_CHAINS } from '../config/chains';
import { TokenConfig } from '../types/tokens';

export const useWalletEVM = (selectedToken: TokenConfig | null) => {
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  // Check if wallet is already connected on component mount
  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          const address = await signer.getAddress();
          const network = await provider.getNetwork();
          const chainId = network.chainId.toString();

          // Check if chain is supported
          if (!SUPPORTED_CHAINS.some(chain => chain.id === chainId)) {
            console.error('Unsupported chain');
            return;
          }

          setAddress(address);
          setNetwork(network.name);
          setIsConnected(true);
        } catch (error) {
          // Silently fail if not connected
          console.log('No wallet connected');
        }
      }
    };

    checkConnection();
  }, []);

  // Listen for chain changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleChainChanged = async (chainId: string) => {
      // Convert chainId to decimal string if it's in hex
      const normalizedChainId = chainId.startsWith('0x') ? 
        parseInt(chainId, 16).toString() : 
        chainId;

      if (!SUPPORTED_CHAINS.some(chain => chain.id === normalizedChainId)) {
        setAddress(null);
        setNetwork(null);
        setIsConnected(false);
        alert('Please switch to a supported network');
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      setNetwork(network.name);
    };

    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    setIsInitializing(true);
    
    if (!window.ethereum) {
      alert('Please install MetaMask!');
      setIsInitializing(false);
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const chainId = network.chainId.toString();

      // Check if chain is supported
      if (!SUPPORTED_CHAINS.some(chain => chain.id === chainId)) {
        alert('Please switch to a supported network');
        setIsInitializing(false);
        return;
      }
      
      setAddress(address);
      setNetwork(network.name);
      setIsConnected(true);
      
      return address;
    } catch (error) {
      if (error.code === -32002) {
        alert('Connection request already pending. Please check your wallet.');
      } else if (error.code === 4001) {
        alert('Connection request rejected by user.');
      } else {
        console.error('Error connecting wallet:', error);
        alert('Error connecting wallet: ' + error.message);
      }
      throw error;
    } finally {
      setIsInitializing(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setAddress(null);
    setNetwork(null);
    setIsConnected(false);
  }, []);

  const getProvider = useCallback(() => {
    if (!isConnected || !address || !window.ethereum) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, [isConnected, address]);

  const getTokenContract = useCallback(async (tokenAddress: string) => {
    const provider = getProvider();
    if (!provider) {
      console.error('Provider not available');
      return null;
    }
    if (!address) {
      console.error('No wallet address available');
      return null;
    }
    if (!tokenAddress) {
      console.error(`No token address configured for chain ID: ${tokenAddress}`);
      return null;
    }
  
    try {
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        tokenAddress,
        TOKEN_ABI,
        signer
      );
      
      // Verify the contract is properly instantiated
      if (!contract.runner) {
        console.error('Contract not properly initialized');
      }
      
      return contract;
    } catch (error) {
      console.error('Error getting token contract:', error);
    }
  }, [getProvider, address]);

  const approveToken = useCallback(async (amount: string) => {
    if (!selectedToken) {
      throw new Error('No token selected');
    }

    try {
      const contract = await getTokenContract(selectedToken.address);
      if (!contract) throw new Error('Failed to get token contract');

      const amountInWei = ethers.parseUnits(amount, selectedToken.decimals);
      const provider = getProvider();
      if (!provider) throw new Error('Provider not available');

      const signer = await provider.getSigner();
      // @ts-ignore
      const tx = await contract.connect(signer).approve(
        SUPPORTED_CHAINS.find(chain => chain.id === selectedToken.chainId)?.bridgeAddress,
        amountInWei
      );
      await tx.wait();
    } catch (error) {
      console.error('Error approving token:', error);
      throw error;
    }
  }, [getTokenContract, getProvider, selectedToken]);

  const getAllowance = useCallback(async (address: string, spender: string) => {
    if (!selectedToken) {
      throw new Error('No token selected');
    }

    try {
      const contract = await getTokenContract(selectedToken.address);
      if (!contract) throw new Error('Failed to get token contract');

      const allowance = await contract.allowance(address, spender);
      return ethers.formatUnits(allowance, selectedToken.decimals);
    } catch (error) {
      console.error('Error getting allowance:', error);
      throw error;
    }
  }, [getTokenContract, selectedToken]);

  return {
    address,
    network,
    isConnected,
    isInitializing,
    connect,
    disconnect,
    getProvider,
    approveToken,
    getAllowance,
  };
}; 