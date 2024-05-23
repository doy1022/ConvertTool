function mergeCSV() {
    const file1 = document.getElementById('file1').files[0];
    const file2 = document.getElementById('file2').files[0];

    if (!file1 || !file2) {
        alert("2つのCSVファイルをアップロードしてください。");
        return;
    }

    const reader1 = new FileReader();
    const reader2 = new FileReader();

    reader1.onload = function(e1) {
        const csv1 = e1.target.result;
        reader2.onload = function(e2) {
            const csv2 = e2.target.result;
            const mergedCSV = processCSV(csv1, csv2);
            downloadCSV(mergedCSV, 'merged.csv');
        };
        reader2.readAsText(file2);
    };
    reader1.readAsText(file1);
}

function processCSV(csv1, csv2) {
    const parseCSV = (csv) => csv.split('\n').map(line => line.split(','));
    const csvToObject = (csv, commonHeader) => {
        const [header, ...data] = parseCSV(csv);
        const commonIndex = header.indexOf(commonHeader);
        if (commonIndex === -1) {
            throw new Error(`「${commonHeader}」カラムが見つかりません。`);
        }
        return {
            header,
            data: data.map(row => ({ key: row[commonIndex], row }))
        };
    };

    const commonHeader = "宛名番号";
    const { header: header1, data: data1 } = csvToObject(csv1, commonHeader);
    const { header: header2, data: data2 } = csvToObject(csv2, commonHeader);

    const mergedHeader = Array.from(new Set([...header1, ...header2]));
    const map1 = new Map(data1.map(({ key, row }) => [key, row]));
    const map2 = new Map(data2.map(({ key, row }) => [key, row]));

    const mergedData = [];

    map1.forEach((row1, key) => {
        if (map2.has(key)) {
            const row2 = map2.get(key);
            const mergedRow = mergedHeader.map(col => {
                const index1 = header1.indexOf(col);
                const index2 = header2.indexOf(col);
                return index1 !== -1 ? row1[index1] : row2[index2];
            });
            mergedData.push(mergedRow);
        }
    });

    const mergedCSV = [mergedHeader, ...mergedData].map(row => row.join(',')).join('\n');
    return mergedCSV;
}

function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
