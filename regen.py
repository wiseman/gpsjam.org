import datetime
import glob
import os.path
import re
import sys


def main(args):
    # Find all *.csv files in the data directory, and parse out the date from
    # the filename.
    dates = []
    paths = glob.glob("public/data/*.csv")
    for path in paths:
        filename = os.path.basename(path)
        match = re.match(r"^(\d{4}-\d{2}-\d{2}).*?.csv$", filename)
        if match:
            dates.append(match.group(1))
    dates = sorted(dates)
    with open('public/data/manifest.csv', 'w') as f:
        f.write('date,count\n')
        for date in dates:
            f.write(','.join([date, '1']) + '\n')





if __name__ == '__main__':
    main(sys.argv)
