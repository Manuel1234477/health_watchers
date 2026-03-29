// apps/api/src/modules/payments/payments.controller.ts (or wherever you call stellar-service)

import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

@Controller('payments')
export class PaymentsController {
  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  private readonly stellarSecret = this.configService.get('STELLAR_SERVICE_SECRET');
  private readonly stellarUrl = `http://localhost:${this.configService.get('STELLAR_PORT') || 3002}`;

  async fundAccount(publicKey: string, amount: number) {
    const response = await this.httpService.post(
      `${this.stellarUrl}/fund`,
      { publicKey, amount },
      {
        headers: {
          'Authorization': `Bearer ${this.stellarSecret}`,
          'Content-Type': 'application/json',
        },
      },
    ).toPromise();
    
    return response.data;
  }

  async createIntent(fromPublicKey: string, toPublicKey: string, amount: number) {
    const response = await this.httpService.post(
      `${this.stellarUrl}/intent`,
      { fromPublicKey, toPublicKey, amount },
      {
        headers: {
          'Authorization': `Bearer ${this.stellarSecret}`,
          'Content-Type': 'application/json',
        },
      },
    ).toPromise();
    
    return response.data;
  }

  // Verify is public - no secret needed
  async verifyIntent(hash: string) {
    const response = await this.httpService.get(`${this.stellarUrl}/verify/${hash}`).toPromise();
    return response.data;
  }
}