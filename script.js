document.getElementById('csvForm').addEventListener('submit', function(event) {
    event.preventDefault();
    mergeCSV();
});

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
    const lines1 = csv1.split('\n').map(line => line.split(','));
    const lines2 = csv2.split('\n').map(line => line.split(','));

    const header1 = lines1[0];
    const header2 = lines2[0];
    
    const data1 = lines1.slice(1);
    const data2 = lines2.slice(1);

    const commonHeader = "宛名番号";
    const commonIndex1 = header1.indexOf(commonHeader);
    const commonIndex2 = header2.indexOf(commonHeader);

    if (commonIndex1 === -1 || commonIndex2 === -1) {
        alert("両方のCSVファイルに「宛名番号」カラムが必要です。");
        return;
    }

    const map1 = new Map(data1.map(row => [row[commonIndex1], row]));
    const map2 = new Map(data2.map(row => [row[commonIndex2], row]));

    const mergedHeader = [...new Set([...header1, ...header2])];
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
