/* eslint-disable no-control-regex */
import { CustomsMark, getTaxTypeFromItems, InvoiceCarrierType, InvoiceGateway, TaxType } from '@rytass/invoice';
import { createCipheriv, createHash, createDecipheriv } from 'crypto';
import axios from 'axios';
import isEmail from 'validator/lib/isEmail';
import { DateTime } from 'luxon';
import FormData from 'form-data';
import { EZPayInvoice } from './ezpay-invoice';
import { EZPayAvailableCarrier, EZPayBaseUrls, EZPayInvoiceB2BIssueOptions, EZPayInvoiceB2CIssueOptions, EZPayInvoiceGatewayOptions, EZPayInvoiceIssueOptions, EZPayInvoiceIssuePayload, EZPayInvoiceIssueStatus, EZPayInvoiceLoveCodeValidationPayload, EZPayInvoiceLoveCodeValidationSuccessResponse, EZPayInvoiceMobileValidationPayload, EZPayInvoiceMobileValidationSuccessResponse, EZPayInvoiceResponse, EZPayInvoiceSuccessResponse, EZPayPaymentItem, EZPayTaxTypeCode } from './typings';

export class EZPayInvoiceGateway implements InvoiceGateway<EZPayInvoice> {
  private readonly hashKey: string = 'yoRs5AfTfAWe9HI4DlEYKRorr9YvV3Kr';
  private readonly hashIv: string = 'CrJMQLwDF6zKOeaP';
  private readonly merchantId: string = '34818970';
  private readonly baseUrl: string = EZPayBaseUrls.DEVELOPMENT;

  private encrypt<T extends Record<string, any>>(data: T): string {
    const encodedData = Object.entries(data).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');

    const cipher = createCipheriv('aes-256-cbc', this.hashKey, this.hashIv);

    cipher.setAutoPadding(true);

    return [
      cipher.update(encodedData, 'utf8', 'hex'),
      cipher.final('hex'),
    ].join('');
  }

  private decrypt<T>(secret: string): T {
    const decipher = createDecipheriv('aes-256-cbc', this.hashKey, this.hashIv);

    decipher.setAutoPadding(false);

    return [
      decipher.update(secret, 'hex', 'utf8'),
      decipher.final('utf8'),
    ].join('').replace(/\x1b/g, '') as T;
  }

  private getChecksum(postData: string): string {
    return createHash('sha256').update(`HashKey=${this.hashKey}&${postData}&HashIV=${this.hashIv}`).digest('hex').toUpperCase();
  }

  private getCarrierTypeCode(carrier: EZPayAvailableCarrier) {
    switch (carrier.type) {
      case InvoiceCarrierType.MOBILE:
        return '0';

      case InvoiceCarrierType.MOICA:
        return '1';

      case InvoiceCarrierType.PLATFORM:
        return '2';

      default:
        return '';
    }
  }

  private getCarrierCode(carrier: EZPayAvailableCarrier) {
    switch (carrier.type) {
      case InvoiceCarrierType.MOBILE:
      case InvoiceCarrierType.MOICA:
      case InvoiceCarrierType.PLATFORM:
        return carrier.code.trim();

      default:
        return '';
    }
  }

  private getItemTaxRate(item: EZPayPaymentItem, taxType: TaxType, specialTaxPercentage?: number) {
    switch (item.taxType) {
      case TaxType.TAX_FREE:
      case TaxType.ZERO_TAX:
        return 1;

      case TaxType.TAXED:
      default:
        return specialTaxPercentage ? (specialTaxPercentage / 100) + 1 : 1.05;
    }
  }

  constructor(options?: EZPayInvoiceGatewayOptions) {
    this.hashKey = options?.hashKey || this.hashKey;
    this.hashIv = options?.hashIv || this.hashIv;
    this.merchantId = options?.merchantId || this.merchantId;
    this.baseUrl = options?.baseUrl || this.baseUrl;
  }

  async issue(options: EZPayInvoiceIssueOptions): Promise<EZPayInvoice> {
    if (/[^0-9a-z_]/ig.test(options.orderId)) {
      throw new Error('`orderId` only allowed number, alphabet and underline');
    }

    if (!options.orderId || options.orderId.length > 20) {
      throw new Error('`orderId` is required and length less than 20');
    }

    if (options.vatNumber && !/^\d{8}$/.test(options.vatNumber)) {
      throw new Error('Invalid VAT number format');
    }

    if (options.buyerEmail && !isEmail(options.buyerEmail)) {
      throw new Error('`customer.email` is invalid format');
    }

    if (options.vatNumber && options.carrier?.type !== InvoiceCarrierType.PRINT) {
      throw new Error('when `vatNumber` provided, carrier should be PRINT');
    }

    if (!options.vatNumber && options.buyerName.length > 30) {
      throw new Error('B2C invoice `buyerName` maximum length is 30 chars');
    }

    if (options.carrier?.type === InvoiceCarrierType.PLATFORM && !options.buyerEmail) {
      throw new Error('Platform carrier should provide buyer email to received notification');
    }

    const taxType = getTaxTypeFromItems(options.items);

    if (taxType === TaxType.SPECIAL) {
      throw new Error('EZPay not support special tax type');
    }

    if (taxType === TaxType.MIXED && options.vatNumber) {
      throw new Error('B2B Invoice not support mixed tax invoice');
    }

    if (options.carrier?.type === InvoiceCarrierType.LOVE_CODE) {
      // validate love code
      if (!(await this.isLoveCodeValid(options.carrier.code))) {
        throw new Error('Love code is invalid');
      }
    }

    if (options.carrier?.type === InvoiceCarrierType.MOBILE) {
      // validate mobile
      if (!(await this.isMobileBarcodeValid(options.carrier.code))) {
        throw new Error('Mobile barcode is invalid');
      }
    }

    if (options.carrier?.type === InvoiceCarrierType.MOICA && !/^[A-Z]{2}[0-9]{14}$/.test(options.carrier.code)) {
      throw new Error('invalid MOICA code');
    }

    const carrierType = this.getCarrierTypeCode((options as EZPayInvoiceB2CIssueOptions).carrier);
    const carrierCode = this.getCarrierCode((options as EZPayInvoiceB2CIssueOptions).carrier);
    const taxTypeCode = EZPayTaxTypeCode[taxType] as ('1' | '2' | '3' | '9');
    const taxRate = Number(~[TaxType.TAX_FREE, TaxType.ZERO_TAX].indexOf(taxType) ? '0' : (options.specialTaxPercentage?.toString() || '5'))
    const totalAmount = options.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const amountWithoutTax = Math.round(options.items.reduce((sum, item) => sum + (
        (item.quantity * item.unitPrice) / this.getItemTaxRate(item, taxType, options.specialTaxPercentage)
      ), 0));

    if (totalAmount <= 0) {
      throw new Error('invoice amount should more than zero');
    }

    const postData = this.encrypt<EZPayInvoiceIssuePayload>({
      RespondType: 'JSON',
      Version: '1.5',
      TimeStamp: Math.floor(Date.now() / 1000).toString(),
      TransNum: options.ezPayTransNumber || '',
      MerchantOrderNo: options.orderId,
      Status: EZPayInvoiceIssueStatus.INSTANT,
      CreateStatusTime: '',
      Category: options.vatNumber ? 'B2B' : 'B2C',
      BuyerName: options.vatNumber ? (
        options.buyerName.length > 60 ? options.vatNumber : options.buyerName
      ) : options.buyerName,
      BuyerUBN: options.vatNumber ?? '',
      BuyerAddress: (options.vatNumber ? (options as EZPayInvoiceB2BIssueOptions).buyerAddress : '') ?? '',
      BuyerEmail: options.buyerEmail ?? '',
      CarrierType: carrierType,
      CarrierNum: carrierCode,
      LoveCode: options.carrier?.type === InvoiceCarrierType.LOVE_CODE ? options.carrier.code : '',
      PrintFlag: options.vatNumber || (!carrierType && options.carrier?.type !== InvoiceCarrierType.LOVE_CODE) ? 'Y' : 'N',
      KioskPrintFlag: options.carrier?.type === InvoiceCarrierType.PLATFORM ? '' : '',
      TaxType: taxTypeCode,
      TaxRate: taxRate.toString(),
      CustomsClearance: taxType === TaxType.ZERO_TAX ? (
        options.customsMark === CustomsMark.YES ? '2' : '1'
      ) : '',
      Amt: amountWithoutTax.toString(),
      AmtSales: taxType === TaxType.MIXED ? (
        Math.round(options.items.reduce((sum, item) => {
          if (item.taxType && ~[TaxType.TAX_FREE, TaxType.ZERO_TAX].indexOf(item.taxType)) return sum;

          const itemTaxRate = this.getItemTaxRate(item, taxType, options.specialTaxPercentage);

          return sum + (item.quantity * item.unitPrice) / itemTaxRate;
        }, 0)).toString()
      ) : '',
      AmtZero: taxType === TaxType.MIXED ? (
        (Math.round(options.items.reduce((sum, item) => {
          if (item.taxType !== TaxType.ZERO_TAX) return sum;

          return sum + (item.quantity * item.unitPrice);
        }, 0)) || '').toString()
      ) : '',
      AmtFree: taxType === TaxType.MIXED ? (
        (Math.round(options.items.reduce((sum, item) => {
          if (item.taxType !== TaxType.TAX_FREE) return sum;

          return sum + (item.quantity * item.unitPrice);
        }, 0)) || '').toString()
      ) : '',
      TaxAmt: (totalAmount - amountWithoutTax).toString(),
      TotalAmt: totalAmount.toString(),
      ItemName: options.items.map(item => item.name).join('|'),
      ItemCount: options.items.map(item => item.quantity).join('|'),
      ItemUnit: options.items.map(item => item.unit || '式').join('|'),
      ItemPrice: options.items.map((item) => {
        if (!options.vatNumber) return item.unitPrice;

        const itemTaxRate = this.getItemTaxRate(item, taxType, options.specialTaxPercentage);

        return Math.round(item.unitPrice / itemTaxRate);
      }).join('|'),
      ItemAmt: options.items.map((item) => {
        if (!options.vatNumber) return item.unitPrice * item.quantity;

        const itemTaxRate = this.getItemTaxRate(item, taxType, options.specialTaxPercentage);

        return Math.round((item.quantity * item.unitPrice) / itemTaxRate);
      }).join('|'),
      ItemTaxType: taxType === TaxType.MIXED ? options.items.map((item) => {
        switch (item.taxType) {
          case TaxType.TAX_FREE:
            return '3';

          case TaxType.ZERO_TAX:
            return '2';

          case TaxType.SPECIAL:
          case TaxType.TAXED:
          default:
            return '1';
        }
      }).join('|') : '',
      Comment: options.remark?.slice(0, 200) ?? '',
    });

    const formData = new FormData();

    formData.append('MerchantID_', this.merchantId);
    formData.append('PostData_', postData);

    const { data } = await axios.post<EZPayInvoiceResponse>(`${this.baseUrl}/Api/invoice_issue`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (data.Status !== 'SUCCESS') {
      throw new Error(data.Message);
    }

    const payload = JSON.parse(data.Result) as EZPayInvoiceSuccessResponse;

    return new EZPayInvoice({
      items: options.items,
      issuedOn: DateTime.fromFormat(payload.CreateTime, 'yyyy-MM-dd HH:mm:ss').toJSDate(),
      invoiceNumber: payload.InvoiceNumber,
      randomCode: payload.RandomNum,
    });
  }

  async isMobileBarcodeValid(code: string): Promise<boolean> {
    const postData = this.encrypt<EZPayInvoiceMobileValidationPayload>({
      TimeStamp: Math.floor(Date.now() / 1000).toString(),
      CellphoneBarcode: code,
    });

    const formData = new FormData();

    formData.append('MerchantID_', this.merchantId);
    formData.append('Version', '1.0');
    formData.append('RespondType', 'JSON');
    formData.append('PostData_', postData);
    formData.append('CheckValue', this.getChecksum(postData));

    const { data } = await axios.post<EZPayInvoiceResponse>(`${this.baseUrl}/Api_inv_application/checkBarCode`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (data.Status !== 'SUCCESS') {
      throw new Error(data.Message);
    }

    const payload = this.decrypt<string>(data.Result)
      .split(/&/)
      .reduce((vars, item) => {
        const [key, value] = item.split(/=/);

        return {
          ...vars,
          [key]: decodeURIComponent(value.trim()).replaceAll('\x1B/', ''),
        };
      }, {}) as EZPayInvoiceMobileValidationSuccessResponse;

    return payload.IsExist === 'Y';
  }

  async isLoveCodeValid(code: string): Promise<boolean> {
    const postData = this.encrypt<EZPayInvoiceLoveCodeValidationPayload>({
      TimeStamp: Math.floor(Date.now() / 1000).toString(),
      LoveCode: code,
    });

    const formData = new FormData();

    formData.append('MerchantID_', this.merchantId);
    formData.append('Version', '1.0');
    formData.append('RespondType', 'JSON');
    formData.append('PostData_', postData);
    formData.append('CheckValue', this.getChecksum(postData));

    const { data } = await axios.post<EZPayInvoiceResponse>(`${this.baseUrl}/Api_inv_application/checkLoveCode`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (data.Status !== 'SUCCESS') {
      throw new Error(data.Message);
    }

    const payload = this.decrypt<string>(data.Result)
      .split(/&/)
      .reduce((vars, item) => {
        const [key, value] = item.split(/=/);

        return {
          ...vars,
          [key]: decodeURIComponent(value.trim()).replaceAll('\x1B/', ''),
        };
      }, {}) as EZPayInvoiceLoveCodeValidationSuccessResponse;

    return payload.IsExist === 'Y';
  }
}

