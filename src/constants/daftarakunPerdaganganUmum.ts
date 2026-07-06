// JANGAN DI PAKE BELUM MAU DI IMPLEMENTASI
export const daftarakunRestaurantCafeAndCoffeeShop = {
    "id": 17,
    "language": "id",
    "name": "Restaurant/Cafe/Coffee Shops",
    "description": "Restaurant/Cafe/Coffee Shops",
    "chart_of_accounts": [
        {
            "code": 110099010,
            "name": "Kas Kecil",
            "alias_name": "Petty Cash",
            "is_cash": true,
            "subclassification": {
                "code": 1100,
                "name": "Kas",
                "alias_name": "Cash",
                "ratio_type": "cash_equivalents",
                "cash_flow_type": "undefined"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 110099020,
            "name": "Kas",
            "alias_name": "Cash in Hand",
            "is_cash": true,
            "subclassification": {
                "code": 1100,
                "name": "Kas",
                "alias_name": "Cash",
                "ratio_type": "cash_equivalents",
                "cash_flow_type": "undefined"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 120099010,
            "name": "Bank",
            "alias_name": "Bank",
            "is_cash": true,
            "subclassification": {
                "code": 1200,
                "name": "Bank",
                "alias_name": "Bank",
                "ratio_type": "cash_equivalents",
                "cash_flow_type": "undefined"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 130099010,
            "name": "Piutang Usaha",
            "alias_name": "Account Receivable",
            "is_cash": false,
            "subclassification": {
                "code": 1300,
                "name": "Piutang Usaha",
                "alias_name": "Accounts Receivables",
                "ratio_type": "receivables",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 139099910,
            "name": "Piutang Giro",
            "alias_name": "Post-dated Receivable",
            "is_cash": false,
            "subclassification": {
                "code": 1390,
                "name": "Piutang Lain",
                "alias_name": "Other Receivables",
                "ratio_type": "receivables",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 139099920,
            "name": "Piutang Karyawan",
            "alias_name": "Employee Receivable",
            "is_cash": false,
            "subclassification": {
                "code": 1390,
                "name": "Piutang Lain",
                "alias_name": "Other Receivables",
                "ratio_type": "receivables",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 139099990,
            "name": "Piutang Lain",
            "alias_name": "Other Receivable",
            "is_cash": false,
            "subclassification": {
                "code": 1390,
                "name": "Piutang Lain",
                "alias_name": "Other Receivables",
                "ratio_type": "receivables",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 139099999,
            "name": "Cadangan Kerugian Piutang",
            "alias_name": "Allowance For Doubtful Accounts",
            "is_cash": false,
            "subclassification": {
                "code": 1390,
                "name": "Piutang Lain",
                "alias_name": "Other Receivables",
                "ratio_type": "receivables",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 140099010,
            "name": "Persediaan",
            "alias_name": "Inventory",
            "is_cash": false,
            "subclassification": {
                "code": 1400,
                "name": "Persediaan Barang",
                "alias_name": "Inventories",
                "ratio_type": "inventories",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 149099910,
            "name": "Persediaan Diterima Belum Ditagihkan",
            "alias_name": "Inventory Received Not Billed Yet",
            "is_cash": false,
            "subclassification": {
                "code": 1490,
                "name": "Persediaan Lain",
                "alias_name": "Other Inventories",
                "ratio_type": "inventories",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 151099110,
            "name": "Uang Muka Pembelian",
            "alias_name": "Purchase Advance",
            "is_cash": false,
            "subclassification": {
                "code": 1510,
                "name": "Uang Muka Dibayar",
                "alias_name": "Advances Payment",
                "ratio_type": "prepayments",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 151099130,
            "name": "Uang Muka Pembelian Harta Tetap",
            "alias_name": "Advances For Purchases Of Fixed Assets",
            "is_cash": false,
            "subclassification": {
                "code": 1510,
                "name": "Uang Muka Dibayar",
                "alias_name": "Advances Payment",
                "ratio_type": "prepayments",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 152099211,
            "name": "Pajak Dibayar Dimuka",
            "alias_name": "Prepaid Tax VAT",
            "is_cash": false,
            "subclassification": {
                "code": 1520,
                "name": "Pajak Dibayar Dimuka",
                "alias_name": "Prepaid Taxes",
                "ratio_type": "prepayments",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 153099310,
            "name": "Sewa Dibayar di Muka",
            "alias_name": "Prepaid Rent",
            "is_cash": false,
            "subclassification": {
                "code": 1530,
                "name": "Biaya Dibayar Dimuka",
                "alias_name": "Prepaid Expenses",
                "ratio_type": "prepayments",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 153099320,
            "name": "Asuransi Dibayar di Muka",
            "alias_name": "Prepaid Insurance",
            "is_cash": false,
            "subclassification": {
                "code": 1530,
                "name": "Biaya Dibayar Dimuka",
                "alias_name": "Prepaid Expenses",
                "ratio_type": "prepayments",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 153099390,
            "name": "Biaya Dibayar di Muka Lain",
            "alias_name": "Other Prepaid Expense",
            "is_cash": false,
            "subclassification": {
                "code": 1530,
                "name": "Biaya Dibayar Dimuka",
                "alias_name": "Prepaid Expenses",
                "ratio_type": "prepayments",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 159099910,
            "name": "Biaya Belum Ditagihkan",
            "alias_name": "Cost Not Billed Yet",
            "is_cash": false,
            "subclassification": {
                "code": 1590,
                "name": "Biaya Belum Ditagihkan",
                "alias_name": "Cost Not Billed Yet",
                "ratio_type": "prepayments",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 160099010,
            "name": "Investasi Saham",
            "alias_name": "Stock Investment",
            "is_cash": false,
            "subclassification": {
                "code": 1600,
                "name": "Investasi",
                "alias_name": "Investment",
                "ratio_type": "investments",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 170099010,
            "name": "Tanah",
            "alias_name": "Land",
            "is_cash": false,
            "subclassification": {
                "code": 1700,
                "name": "Harta Tetap Berwujud",
                "alias_name": "Fixed Assets",
                "ratio_type": "fixed_assets",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 170099020,
            "name": "Bangunan",
            "alias_name": "Building",
            "is_cash": false,
            "subclassification": {
                "code": 1700,
                "name": "Harta Tetap Berwujud",
                "alias_name": "Fixed Assets",
                "ratio_type": "fixed_assets",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 170099030,
            "name": "Mesin & Peralatan",
            "alias_name": "Machinery & Equipment",
            "is_cash": false,
            "subclassification": {
                "code": 1700,
                "name": "Harta Tetap Berwujud",
                "alias_name": "Fixed Assets",
                "ratio_type": "fixed_assets",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 170099040,
            "name": "Kendaraan",
            "alias_name": "Vehicle",
            "is_cash": false,
            "subclassification": {
                "code": 1700,
                "name": "Harta Tetap Berwujud",
                "alias_name": "Fixed Assets",
                "ratio_type": "fixed_assets",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 170099090,
            "name": "Harta Lain",
            "alias_name": "Other Assets",
            "is_cash": false,
            "subclassification": {
                "code": 1700,
                "name": "Harta Tetap Berwujud",
                "alias_name": "Fixed Assets",
                "ratio_type": "fixed_assets",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 171099120,
            "name": "Akumulasi Penyusutan Bangunan",
            "alias_name": "Accumulated Depreciation Of Building",
            "is_cash": false,
            "subclassification": {
                "code": 1710,
                "name": "Akumulasi Penyusutan Harta Tetap",
                "alias_name": "Accumulated Depreciation Of Fixed Assets",
                "ratio_type": "fixed_assets",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 171099130,
            "name": "Akumulasi Penyusutan Mesin & Peralatan",
            "alias_name": "Accumulated Depreciation Of Machinery & Equipment",
            "is_cash": false,
            "subclassification": {
                "code": 1710,
                "name": "Akumulasi Penyusutan Harta Tetap",
                "alias_name": "Accumulated Depreciation Of Fixed Assets",
                "ratio_type": "fixed_assets",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 171099140,
            "name": "Akumulasi Penyusutan Kendaraan",
            "alias_name": "Accumulated Depreciation Of Vehicle",
            "is_cash": false,
            "subclassification": {
                "code": 1710,
                "name": "Akumulasi Penyusutan Harta Tetap",
                "alias_name": "Accumulated Depreciation Of Fixed Assets",
                "ratio_type": "fixed_assets",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 171099190,
            "name": "Akumulasi Penyusutan Harta Lain",
            "alias_name": "Accumulated Depreciation Of Other Assets",
            "is_cash": false,
            "subclassification": {
                "code": 1710,
                "name": "Akumulasi Penyusutan Harta Tetap",
                "alias_name": "Accumulated Depreciation Of Fixed Assets",
                "ratio_type": "fixed_assets",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 180099010,
            "name": "Hak Merek",
            "alias_name": "Trademark",
            "is_cash": false,
            "subclassification": {
                "code": 1800,
                "name": "Harta Tetap Tidak Berwujud",
                "alias_name": "Intangible Assets",
                "ratio_type": "fixed_assets",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 180099020,
            "name": "Hak Cipta",
            "alias_name": "Copyright",
            "is_cash": false,
            "subclassification": {
                "code": 1800,
                "name": "Harta Tetap Tidak Berwujud",
                "alias_name": "Intangible Assets",
                "ratio_type": "fixed_assets",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 180099030,
            "name": "Good Will",
            "alias_name": "Goodwill",
            "is_cash": false,
            "subclassification": {
                "code": 1800,
                "name": "Harta Tetap Tidak Berwujud",
                "alias_name": "Intangible Assets",
                "ratio_type": "fixed_assets",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 1,
                "name": "Harta",
                "alias_name": "Asset"
            }
        },
        {
            "code": 210099010,
            "name": "Utang Usaha",
            "alias_name": "Account Payable",
            "is_cash": false,
            "subclassification": {
                "code": 2100,
                "name": "Utang Usaha",
                "alias_name": "Accounts Payables",
                "ratio_type": "current_liabilities",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 2,
                "name": "Kewajiban",
                "alias_name": "Liabilities"
            }
        },
        {
            "code": 219099910,
            "name": "Persediaan Dikirim Belum Ditagihkan",
            "alias_name": "Inventory Sent Not Billed Yet",
            "is_cash": false,
            "subclassification": {
                "code": 2190,
                "name": "Utang Lain",
                "alias_name": "Other Payables",
                "ratio_type": "current_liabilities",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 2,
                "name": "Kewajiban",
                "alias_name": "Liabilities"
            }
        },
        {
            "code": 219099920,
            "name": "Utang Konsinyasi",
            "alias_name": "Consignment Payable",
            "is_cash": false,
            "subclassification": {
                "code": 2190,
                "name": "Utang Lain",
                "alias_name": "Other Payables",
                "ratio_type": "current_liabilities",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 2,
                "name": "Kewajiban",
                "alias_name": "Liabilities"
            }
        },
        {
            "code": 219099930,
            "name": "Utang Giro",
            "alias_name": "Post-dated Payable",
            "is_cash": false,
            "subclassification": {
                "code": 2190,
                "name": "Utang Lain",
                "alias_name": "Other Payables",
                "ratio_type": "current_liabilities",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 2,
                "name": "Kewajiban",
                "alias_name": "Liabilities"
            }
        },
        {
            "code": 219099940,
            "name": "Utang Gaji & Upah",
            "alias_name": "Salaries and Wages Payable",
            "is_cash": false,
            "subclassification": {
                "code": 2190,
                "name": "Utang Lain",
                "alias_name": "Other Payables",
                "ratio_type": "current_liabilities",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 2,
                "name": "Kewajiban",
                "alias_name": "Liabilities"
            }
        },
        {
            "code": 219099950,
            "name": "Utang Komisi Penjualan",
            "alias_name": "Sales Commission Payable",
            "is_cash": false,
            "subclassification": {
                "code": 2190,
                "name": "Utang Lain",
                "alias_name": "Other Payables",
                "ratio_type": "current_liabilities",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 2,
                "name": "Kewajiban",
                "alias_name": "Liabilities"
            }
        },
        {
            "code": 221099110,
            "name": "Uang Muka Penjualan",
            "alias_name": "Cutomer Deposit",
            "is_cash": false,
            "subclassification": {
                "code": 2210,
                "name": "Uang Muka Diterima",
                "alias_name": "Advances Received",
                "ratio_type": "current_liabilities",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 2,
                "name": "Kewajiban",
                "alias_name": "Liabilities"
            }
        },
        {
            "code": 229099910,
            "name": "Pendapatan Belum Ditagihkan",
            "alias_name": "Revenue Not Billed Yet",
            "is_cash": false,
            "subclassification": {
                "code": 2290,
                "name": "Pendapatan Belum Ditagihkan",
                "alias_name": "Revenue Not Billed Yet",
                "ratio_type": "current_liabilities",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 2,
                "name": "Kewajiban",
                "alias_name": "Liabilities"
            }
        },
        {
            "code": 230099011,
            "name": "Utang Pajak",
            "alias_name": "Tax Payable",
            "is_cash": false,
            "subclassification": {
                "code": 2300,
                "name": "Utang Pajak",
                "alias_name": "Taxes Payable",
                "ratio_type": "current_liabilities",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 2,
                "name": "Kewajiban",
                "alias_name": "Liabilities"
            }
        },
        {
            "code": 250099010,
            "name": "Utang Bank",
            "alias_name": "Bank Loans",
            "is_cash": false,
            "subclassification": {
                "code": 2500,
                "name": "Utang Jangka Panjang",
                "alias_name": "Long-term Payable",
                "ratio_type": "long_term_liabilities",
                "cash_flow_type": "financing"
            },
            "classification": {
                "code": 2,
                "name": "Kewajiban",
                "alias_name": "Liabilities"
            }
        },
        {
            "code": 250099020,
            "name": "Utang Pembiayaan",
            "alias_name": "Finance Lease Liabilities",
            "is_cash": false,
            "subclassification": {
                "code": 2500,
                "name": "Utang Jangka Panjang",
                "alias_name": "Long-term Payable",
                "ratio_type": "long_term_liabilities",
                "cash_flow_type": "financing"
            },
            "classification": {
                "code": 2,
                "name": "Kewajiban",
                "alias_name": "Liabilities"
            }
        },
        {
            "code": 310099010,
            "name": "Modal Disetor",
            "alias_name": "Paid-In Capital",
            "is_cash": false,
            "subclassification": {
                "code": 3100,
                "name": "Modal",
                "alias_name": "Equity",
                "ratio_type": "equities",
                "cash_flow_type": "financing"
            },
            "classification": {
                "code": 3,
                "name": "Modal",
                "alias_name": "Equity"
            }
        },
        {
            "code": 310099020,
            "name": "Saham Biasa",
            "alias_name": "Common Stock",
            "is_cash": false,
            "subclassification": {
                "code": 3100,
                "name": "Modal",
                "alias_name": "Equity",
                "ratio_type": "equities",
                "cash_flow_type": "financing"
            },
            "classification": {
                "code": 3,
                "name": "Modal",
                "alias_name": "Equity"
            }
        },
        {
            "code": 320099010,
            "name": "Laba ditahan",
            "alias_name": "Retained Earnings",
            "is_cash": false,
            "subclassification": {
                "code": 3200,
                "name": "Laba",
                "alias_name": "Earning",
                "ratio_type": "earnings",
                "cash_flow_type": "financing"
            },
            "classification": {
                "code": 3,
                "name": "Modal",
                "alias_name": "Equity"
            }
        },
        {
            "code": 320099020,
            "name": "Laba Tahun Berjalan",
            "alias_name": "Current Year Earnings",
            "is_cash": false,
            "subclassification": {
                "code": 3200,
                "name": "Laba",
                "alias_name": "Earning",
                "ratio_type": "earnings",
                "cash_flow_type": "financing"
            },
            "classification": {
                "code": 3,
                "name": "Modal",
                "alias_name": "Equity"
            }
        },
        {
            "code": 320099099,
            "name": "Historical Balancing",
            "alias_name": "Historical Balancing",
            "is_cash": false,
            "subclassification": {
                "code": 3200,
                "name": "Laba",
                "alias_name": "Earning",
                "ratio_type": "earnings",
                "cash_flow_type": "financing"
            },
            "classification": {
                "code": 3,
                "name": "Modal",
                "alias_name": "Equity"
            }
        },
        {
            "code": 410099010,
            "name": "Penjualan Produk",
            "alias_name": "Sales Products",
            "is_cash": false,
            "subclassification": {
                "code": 4100,
                "name": "Pendapatan Usaha",
                "alias_name": "Operating Revenues",
                "ratio_type": "revenues",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 4,
                "name": "Pendapatan",
                "alias_name": "Revenues"
            }
        },
        {
            "code": 420099010,
            "name": "Penjualan Jasa",
            "alias_name": "Sales Services",
            "is_cash": false,
            "subclassification": {
                "code": 4100,
                "name": "Pendapatan Usaha",
                "alias_name": "Operating Revenues",
                "ratio_type": "revenues",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 4,
                "name": "Pendapatan",
                "alias_name": "Revenues"
            }
        },
        {
            "code": 410099040,
            "name": "Potongan Penjualan",
            "alias_name": "Sales Discount",
            "is_cash": false,
            "subclassification": {
                "code": 4200,
                "name": "Potongan Penjualan",
                "alias_name": "Sales Discount",
                "ratio_type": "revenues",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 4,
                "name": "Pendapatan",
                "alias_name": "Revenues"
            }
        },
        {
            "code": 490099010,
            "name": "Pendapatan Lain",
            "alias_name": "Other Revenues",
            "is_cash": false,
            "subclassification": {
                "code": 4900,
                "name": "Pendapatan Lain",
                "alias_name": "Other Revenues",
                "ratio_type": "revenues",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 4,
                "name": "Pendapatan",
                "alias_name": "Revenues"
            }
        },
        {
            "code": 510099010,
            "name": "Harga Pokok Penjualan",
            "alias_name": "Cost of Goods Sold",
            "is_cash": false,
            "subclassification": {
                "code": 5100,
                "name": "Beban atas Pendapatan",
                "alias_name": "Cost of Goods Sold",
                "ratio_type": "cost_of_revenues",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 5,
                "name": "Beban Atas Pendapatan",
                "alias_name": "Cost of Revenues"
            }
        },
        {
            "code": 510099040,
            "name": "Beban Pembelian",
            "alias_name": "Purchase Cost",
            "is_cash": false,
            "subclassification": {
                "code": 5100,
                "name": "Beban atas Pendapatan",
                "alias_name": "Cost of Goods Sold",
                "ratio_type": "cost_of_revenues",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 5,
                "name": "Beban Atas Pendapatan",
                "alias_name": "Cost of Revenues"
            }
        },
        {
            "code": 510099050,
            "name": "Beban Pengiriman",
            "alias_name": "Freight Expenses",
            "is_cash": false,
            "subclassification": {
                "code": 5100,
                "name": "Beban atas Pendapatan",
                "alias_name": "Cost of Goods Sold",
                "ratio_type": "cost_of_revenues",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 5,
                "name": "Beban Atas Pendapatan",
                "alias_name": "Cost of Revenues"
            }
        },
        {
            "code": 510099060,
            "name": "Potongan Pembelian",
            "alias_name": "Purchase Discount",
            "is_cash": false,
            "subclassification": {
                "code": 5100,
                "name": "Beban atas Pendapatan",
                "alias_name": "Cost of Goods Sold",
                "ratio_type": "cost_of_revenues",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 5,
                "name": "Beban Atas Pendapatan",
                "alias_name": "Cost of Revenues"
            }
        },
        {
            "code": 510099070,
            "name": "Penyesuaian Persediaan",
            "alias_name": "Inventory Adjustments",
            "is_cash": false,
            "subclassification": {
                "code": 5100,
                "name": "Beban atas Pendapatan",
                "alias_name": "Cost of Goods Sold",
                "ratio_type": "cost_of_revenues",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 5,
                "name": "Beban Atas Pendapatan",
                "alias_name": "Cost of Revenues"
            }
        },
        {
            "code": 610099010,
            "name": "Beban Iklan & Promosi",
            "alias_name": "Advertising and Promotion Expenses",
            "is_cash": false,
            "subclassification": {
                "code": 6100,
                "name": "Beban Pemasaran Dan Penjualan",
                "alias_name": "Marketing And Selling Expenses",
                "ratio_type": "operating_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 6,
                "name": "Beban Operasional",
                "alias_name": "Operating Expenses"
            }
        },
        {
            "code": 610099020,
            "name": "Beban Komisi Penjualan",
            "alias_name": "Sales Commission Expenses",
            "is_cash": false,
            "subclassification": {
                "code": 6100,
                "name": "Beban Pemasaran Dan Penjualan",
                "alias_name": "Marketing And Selling Expenses",
                "ratio_type": "operating_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 6,
                "name": "Beban Operasional",
                "alias_name": "Operating Expenses"
            }
        },
        {
            "code": 610099030,
            "name": "Beban Piutang Tak Tertagih",
            "alias_name": "Bad Debts Expenses",
            "is_cash": false,
            "subclassification": {
                "code": 6100,
                "name": "Beban Pemasaran Dan Penjualan",
                "alias_name": "Marketing And Selling Expenses",
                "ratio_type": "operating_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 6,
                "name": "Beban Operasional",
                "alias_name": "Operating Expenses"
            }
        },
        {
            "code": 620099010,
            "name": "Beban Gaji & Upah",
            "alias_name": "Wages and Salaries Expenses",
            "is_cash": false,
            "subclassification": {
                "code": 6200,
                "name": "Beban Administrasi Dan Umum",
                "alias_name": "Administration & General Expenses",
                "ratio_type": "operating_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 6,
                "name": "Beban Operasional",
                "alias_name": "Operating Expenses"
            }
        },
        {
            "code": 620099020,
            "name": "Beban Staff Ahli & Perizinan",
            "alias_name": "Professional and Legal Fees",
            "is_cash": false,
            "subclassification": {
                "code": 6200,
                "name": "Beban Administrasi Dan Umum",
                "alias_name": "Administration & General Expenses",
                "ratio_type": "operating_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 6,
                "name": "Beban Operasional",
                "alias_name": "Operating Expenses"
            }
        },
        {
            "code": 620099031,
            "name": "Beban Sewa Kantor",
            "alias_name": "Rent Expenses",
            "is_cash": false,
            "subclassification": {
                "code": 6200,
                "name": "Beban Administrasi Dan Umum",
                "alias_name": "Administration & General Expenses",
                "ratio_type": "operating_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 6,
                "name": "Beban Operasional",
                "alias_name": "Operating Expenses"
            }
        },
        {
            "code": 620099032,
            "name": "Beban Listrik",
            "alias_name": "Electricity Expenses",
            "is_cash": false,
            "subclassification": {
                "code": 6200,
                "name": "Beban Administrasi Dan Umum",
                "alias_name": "Administration & General Expenses",
                "ratio_type": "operating_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 6,
                "name": "Beban Operasional",
                "alias_name": "Operating Expenses"
            }
        },
        {
            "code": 620099033,
            "name": "Beban Air",
            "alias_name": "Water Expenses",
            "is_cash": false,
            "subclassification": {
                "code": 6200,
                "name": "Beban Administrasi Dan Umum",
                "alias_name": "Administration & General Expenses",
                "ratio_type": "operating_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 6,
                "name": "Beban Operasional",
                "alias_name": "Operating Expenses"
            }
        },
        {
            "code": 620099034,
            "name": "Beban Telepon",
            "alias_name": "Communication Expenses",
            "is_cash": false,
            "subclassification": {
                "code": 6200,
                "name": "Beban Administrasi Dan Umum",
                "alias_name": "Administration & General Expenses",
                "ratio_type": "operating_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 6,
                "name": "Beban Operasional",
                "alias_name": "Operating Expenses"
            }
        },
        {
            "code": 620099035,
            "name": "Beban Internet",
            "alias_name": "Internet Expenses",
            "is_cash": false,
            "subclassification": {
                "code": 6200,
                "name": "Beban Administrasi Dan Umum",
                "alias_name": "Administration & General Expenses",
                "ratio_type": "operating_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 6,
                "name": "Beban Operasional",
                "alias_name": "Operating Expenses"
            }
        },
        {
            "code": 620099040,
            "name": "Beban Perlengkapan",
            "alias_name": "Supplies Expenses",
            "is_cash": false,
            "subclassification": {
                "code": 6200,
                "name": "Beban Administrasi Dan Umum",
                "alias_name": "Administration & General Expenses",
                "ratio_type": "operating_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 6,
                "name": "Beban Operasional",
                "alias_name": "Operating Expenses"
            }
        },
        {
            "code": 690099010,
            "name": "Beban Lain",
            "alias_name": "Other Expenses",
            "is_cash": false,
            "subclassification": {
                "code": 6900,
                "name": "Beban Operasional Lain",
                "alias_name": "Other Operational Expenses",
                "ratio_type": "operating_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 6,
                "name": "Beban Operasional",
                "alias_name": "Operating Expenses"
            }
        },
        {
            "code": 710099020,
            "name": "Beban Penyusutan Bangunan",
            "alias_name": "Depreciation Of Building",
            "is_cash": false,
            "subclassification": {
                "code": 7100,
                "name": "Beban Penyusutan",
                "alias_name": "Depreciation Expense of Fixed Assets",
                "ratio_type": "non_operating_expenses",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 7,
                "name": "Beban Non Operasional",
                "alias_name": "Non Operating Expenses"
            }
        },
        {
            "code": 710099030,
            "name": "Beban Penyusutan Mesin & Peralatan",
            "alias_name": "Depreciation Of Machinery & Equipment",
            "is_cash": false,
            "subclassification": {
                "code": 7100,
                "name": "Beban Penyusutan",
                "alias_name": "Depreciation Expense of Fixed Assets",
                "ratio_type": "non_operating_expenses",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 7,
                "name": "Beban Non Operasional",
                "alias_name": "Non Operating Expenses"
            }
        },
        {
            "code": 710099040,
            "name": "Beban Penyusutan Kendaraan",
            "alias_name": "Depreciation Of Vehicle",
            "is_cash": false,
            "subclassification": {
                "code": 7100,
                "name": "Beban Penyusutan",
                "alias_name": "Depreciation Expense of Fixed Assets",
                "ratio_type": "non_operating_expenses",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 7,
                "name": "Beban Non Operasional",
                "alias_name": "Non Operating Expenses"
            }
        },
        {
            "code": 710099090,
            "name": "Beban Penyusutan Harta Lain",
            "alias_name": "Depreciation Of Other Assets",
            "is_cash": false,
            "subclassification": {
                "code": 7100,
                "name": "Beban Penyusutan",
                "alias_name": "Depreciation Expense of Fixed Assets",
                "ratio_type": "non_operating_expenses",
                "cash_flow_type": "investing"
            },
            "classification": {
                "code": 7,
                "name": "Beban Non Operasional",
                "alias_name": "Non Operating Expenses"
            }
        },
        {
            "code": 810099010,
            "name": "Laba (Rugi) Selisih Kurs - Unrealize",
            "alias_name": "Gain (Loss) on Foreign Exchange Rate - Unrealize",
            "is_cash": false,
            "subclassification": {
                "code": 8100,
                "name": "Pendapatan Luar Usaha",
                "alias_name": "Other Revenues",
                "ratio_type": "other_revenues",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 8,
                "name": "Pendapatan Lain",
                "alias_name": "Other Revenues"
            }
        },
        {
            "code": 810099011,
            "name": "Laba (Rugi) Selisih Kurs - Realize",
            "alias_name": "Gain (Loss) on Foreign Exchange Rate - Realize",
            "is_cash": false,
            "subclassification": {
                "code": 8100,
                "name": "Pendapatan Luar Usaha",
                "alias_name": "Other Revenues",
                "ratio_type": "other_revenues",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 8,
                "name": "Pendapatan Lain",
                "alias_name": "Other Revenues"
            }
        },
        {
            "code": 810099020,
            "name": "Laba (Rugi) Penjualan Harta Tetap",
            "alias_name": "Gain (Loss) on Sales Of Fixed Assets",
            "is_cash": false,
            "subclassification": {
                "code": 8100,
                "name": "Pendapatan Luar Usaha",
                "alias_name": "Other Revenues",
                "ratio_type": "other_revenues",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 8,
                "name": "Pendapatan Lain",
                "alias_name": "Other Revenues"
            }
        },
        {
            "code": 910099011,
            "name": "Beban Bunga Bank",
            "alias_name": "Bank Interest",
            "is_cash": false,
            "subclassification": {
                "code": 9100,
                "name": "Beban Luar Usaha",
                "alias_name": "Other Expenses",
                "ratio_type": "other_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 9,
                "name": "Beban Lain",
                "alias_name": "Other Expenses"
            }
        },
        {
            "code": 910099012,
            "name": "Beban Jasa Bank",
            "alias_name": "Bank Administration",
            "is_cash": false,
            "subclassification": {
                "code": 9100,
                "name": "Beban Luar Usaha",
                "alias_name": "Other Expenses",
                "ratio_type": "other_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 9,
                "name": "Beban Lain",
                "alias_name": "Other Expenses"
            }
        },
        {
            "code": 990099010,
            "name": "Beban Pajak Penghasilan",
            "alias_name": "Income Tax Expense",
            "is_cash": false,
            "subclassification": {
                "code": 9900,
                "name": "Beban Pajak",
                "alias_name": "Tax Expense",
                "ratio_type": "tax_expenses",
                "cash_flow_type": "operating"
            },
            "classification": {
                "code": 9,
                "name": "Beban Lain",
                "alias_name": "Other Expenses"
            }
        }
    ],
    "product_variants": [
        {
            "code": "XS",
            "name": "Extra Small",
            "value": "Extra Small",
            "category": {
                "code": "size",
                "name": "Size"
            }
        },
        {
            "code": "S",
            "name": "Small",
            "value": "Small",
            "category": {
                "code": "size",
                "name": "Size"
            }
        },
        {
            "code": "M",
            "name": "Medium",
            "value": "Medium",
            "category": {
                "code": "size",
                "name": "Size"
            }
        },
        {
            "code": "L",
            "name": "Large",
            "value": "Large",
            "category": {
                "code": "size",
                "name": "Size"
            }
        },
        {
            "code": "XL",
            "name": "Extra Large",
            "value": "Extra Large",
            "category": {
                "code": "size",
                "name": "Size"
            }
        },
        {
            "code": "black",
            "name": "Black",
            "value": "#000000",
            "category": {
                "code": "color",
                "name": "Color"
            }
        },
        {
            "code": "white",
            "name": "White",
            "value": "#ffffff",
            "category": {
                "code": "color",
                "name": "Color"
            }
        },
        {
            "code": "red",
            "name": "Red",
            "value": "#eb3b5a",
            "category": {
                "code": "color",
                "name": "Color"
            }
        },
        {
            "code": "yellow",
            "name": "Yellow",
            "value": "#f7b731",
            "category": {
                "code": "color",
                "name": "Color"
            }
        },
        {
            "code": "green",
            "name": "Green",
            "value": "#20bf6b",
            "category": {
                "code": "color",
                "name": "Color"
            }
        },
        {
            "code": "cyan",
            "name": "Cyan",
            "value": "#2d98da",
            "category": {
                "code": "color",
                "name": "Color"
            }
        },
        {
            "code": "blue",
            "name": "Blue",
            "value": "#3867d6",
            "category": {
                "code": "color",
                "name": "Color"
            }
        },
        {
            "code": "magenta",
            "name": "Magenta",
            "value": "#be2edd",
            "category": {
                "code": "color",
                "name": "Color"
            }
        }
    ]
}
