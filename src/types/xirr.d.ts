declare module 'xirr' {
  export interface Transaction {
    amount: number;
    when: Date;
  }
  export default function xirr(transactions: Transaction[], guess?: number): number;
}