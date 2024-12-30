import {
    composeContext,
    elizaLogger,
    generateObjectDeprecated,
    ModelClass,
    type IAgentRuntime,
    type Memory,
    type State,
} from "@elizaos/core";
import {
    getTokens,
    getToken,
    getTokenBalance,
    getTokenBalances,
    ChainId,
} from "@lifi/sdk";

import { initWalletProvider, WalletProvider } from "../providers/wallet";
import { getBalanceTemplate } from "../templates";
import type { Balance, GetBalanceParams } from "../types";
import { Address, formatEther, formatUnits } from "viem";

export { getBalanceTemplate };

export class GetBalanceAction {
    constructor(private walletProvider: WalletProvider) {}

    async getBalance(params: GetBalanceParams): Promise<Balance[]> {
        const { chain, address, token } = params;
        if (chain == "bscTestnet") {
            throw new Error("Testnet is not supported");
        }

        this.walletProvider.switchChain(chain);
        const nativeSymbol =
            this.walletProvider.getChainConfigs(chain).nativeCurrency.symbol;
        const chainId = this.walletProvider.getChainConfigs(chain).id;

        // If specific token is requested and it's not the native token
        if (token && token !== nativeSymbol) {
            const balance = await this.getTokenBalance(chainId, address, token);
            return [{ token, balance }];
        }

        // If no specific token is requested, get all token balances
        if (!token) {
            return this.getTokenBalances(chainId, address);
        }

        // If native token is requested
        const nativeBalanceWei = await this.walletProvider
            .getPublicClient(chain)
            .getBalance({ address });
        return [
            { token: nativeSymbol, balance: formatEther(nativeBalanceWei) },
        ];
    }

    async getTokenBalance(
        chainId: ChainId,
        address: Address,
        tokenSymbol: string
    ): Promise<string> {
        const token = await getToken(chainId, tokenSymbol);
        const tokenBalance = await getTokenBalance(address, token);
        return formatUnits(tokenBalance?.amount ?? 0n, token.decimals);
    }

    async getTokenBalances(
        chainId: ChainId,
        address: Address
    ): Promise<Balance[]> {
        const tokensResponse = await getTokens();
        const tokens = tokensResponse.tokens[chainId];

        const tokenBalances = await getTokenBalances(address, tokens);
        return tokenBalances
            .filter((balance) => balance.amount && balance.amount !== 0n)
            .map((balance) => ({
                token: balance.symbol,
                balance: formatUnits(balance.amount!, balance.decimals),
            }));
    }
}

export const getBalanceAction = {
    name: "getBalance",
    description: "Get balance of a token or all tokens for the given address",
    handler: async (
        runtime: IAgentRuntime,
        _message: Memory,
        state: State,
        _options: any,
        callback?: any
    ) => {
        elizaLogger.log("GetBalance action handler called");
        const walletProvider = initWalletProvider(runtime);
        const action = new GetBalanceAction(walletProvider);

        // Compose swap context
        const getBalanceContext = composeContext({
            state,
            template: getBalanceTemplate,
        });
        const content = await generateObjectDeprecated({
            runtime,
            context: getBalanceContext,
            modelClass: ModelClass.LARGE,
        });

        if (!content.address) {
            content.address = walletProvider.getAddress();
        }

        const getBalanceOptions: GetBalanceParams = {
            chain: content.chain,
            address: content.address,
            token: content.token,
        };

        try {
            const getBalanceResp = await action.getBalance(getBalanceOptions);
            if (callback) {
                let text = `No balance found for ${getBalanceOptions.address} on ${getBalanceOptions.chain}`;
                if (getBalanceResp.length > 0) {
                    text = `Balance of ${getBalanceOptions.address} on ${getBalanceOptions.chain}:\n${getBalanceResp
                        .map(({ token, balance }) => `${balance} ${token}`)
                        .join("\n")}`;
                }
                callback({
                    text,
                    content: {
                        success: true,
                        balances: getBalanceResp,
                        chain: content.chain,
                    },
                });
            }
            return true;
        } catch (error) {
            console.error("Error in getBalance handler:", error.message);
            if (callback) {
                callback({ text: `Error: ${error.message}` });
            }
            return false;
        }
    },
    template: getBalanceTemplate,
    validate: async (_runtime: IAgentRuntime) => {
        return true;
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "Check balance of USDC on Bsc",
                    action: "GET_BALANCE",
                },
            },
            {
                user: "user",
                content: {
                    text: "Check balance of USDC for 0x742d35Cc6634C0532925a3b844Bc454e4438f44e on Bsc",
                    action: "CHECK_BALANCE",
                },
            },
        ],
    ],
    similes: ["GET_BALANCE", "CHECK_BALANCE"],
};
