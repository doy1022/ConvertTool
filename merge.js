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
            try {
                const mergedCSV = processCSV(csv1, csv2);
                downloadCSV(mergedCSV, 'merged.csv');
            } catch (error) {
                alert(error.message);
            }
        };
        reader2.readAsText(file2);
    };
    reader1.readAsText(file1);
}

function parseCSV(csv) {
    return csv.trim().split('\n').map(line => line.split(','));
}

function csvToObject(csv) {
    const [header, ...data] = parseCSV(csv);
    const commonIndex = header.indexOf('宛名番号');
    if (commonIndex === -1) {
        throw new Error('「宛名番号」カラムが見つかりません。');
    }
    const map = new Map(data.map(row => [row[commonIndex], row]));
    return { header, map };
}

function processCSV(csv1, csv2) {
    const { header: header1, map: map1 } = csvToObject(csv1);
    const { header: header2, map: map2 } = csvToObject(csv2);

    // 共通ヘッダーを作成
    const mergedHeader = Array.from(new Set([...header1, ...header2].sort((a, b) => a.localeCompare(b))));
    const mergedData = [];

    map1.forEach((row1, key) => {
        if (map2.has(key)) {
            const row2 = map2.get(key);
            const mergedRow = mergedHeader.map(header => {
                const index1 = header1.indexOf(header);
                const index2 = header2.indexOf(header);
                // headerがheader1とheader2のどちらにも存在すればそのデータを使用
                return (index1 !== -1 ? row1[index1] : '') || (index2 !== -1 ? row2[index2] : '');
            });
            mergedData.push(mergedRow.join(','));
        }
    });

    return [mergedHeader.join(','), ...mergedData].join('\n');
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
