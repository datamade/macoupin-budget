import csv

def cleanup():
    f = open('macoupin-budget_1995-2020.csv', 'rb')
    reader = csv.DictReader(f)
    all_rows = []
    for row in reader:
        for k,v in row.items():
            if 'Expenditure' in k or 'Appropriation' in k:
                v = v.replace('$', '').replace(',','')
                try:
                    float(v)
                except:
                    v = 0
            row[k] = v
        all_rows.append(row)
    outp = open('macoupin-budget_1995-2020-cleaned.csv', 'wb')
    writer = csv.DictWriter(outp, row.keys())
    writer.writeheader()
    writer.writerows(all_rows)
    f.close()
    outp.close()

if __name__ == "__main__":
    cleanup()
