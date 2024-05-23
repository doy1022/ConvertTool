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

    // 共通ヘッダーの決定
    const mergedHeader = Array.from(new Set([...header1, ...header2]));

    // データのマージ
    const mergedData = [];

    map1.forEach((row1, key) => {
        if (map2.has(key)) {
            const row2 = map2.get(key);
            const mergedRow = {};

            // header1からデータを取得
            header1.forEach((h, i) => {
                mergedRow[h] = row1[i];
            });

            // header2からデータを取得し、マージ
            header2.forEach((h, i) => {
                if (mergedRow[h] === undefined) {
                    mergedRow[h] = row2[i];
                }
            });

            // 最終的な行を作成
            const finalRow = mergedHeader.map(h => mergedRow[h] || '');
            mergedData.push(finalRow.join(','));
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
