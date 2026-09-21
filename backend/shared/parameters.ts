import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'

export interface ParameterReader {
    getSecureString(name: string): Promise<string>
}

export class CachedSsmParameterReader implements ParameterReader {
    // Lambda containerが再利用された場合は同じSecureStringを再取得せず、
    // SSM APIの呼び出し回数・遅延・料金を抑える。
    private readonly cache = new Map<string, string>()

    public constructor(private readonly client = new SSMClient({})) {}

    public async getSecureString(name: string): Promise<string> {
        const cached = this.cache.get(name)
        if (cached !== undefined) {
            return cached
        }

        // SecureStringなのでWithDecryptionを明示する。取得権限はCDK側で対象2件に限定する。
        const response = await this.client.send(
            new GetParameterCommand({ Name: name, WithDecryption: true }),
        )
        const value = response.Parameter?.Value
        if (!value) {
            throw new Error(`SSM parameter has no value: ${name}`)
        }

        this.cache.set(name, value)
        return value
    }
}
