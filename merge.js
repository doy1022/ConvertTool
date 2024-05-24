// CSVファイルのマージ
function mergeCSV() {
    const file1 = document.getElementById('file1').files[0];
    const file2 = document.getElementById('file2').files[0];

    if (!file1 || !file2) {
        alert("2つのCSVファイルをアップロードしてください。");
        return;
    }

    const reader1 = new FileReader();
    const reader2 = new FileReader();

    reader1.onload = function (e1) {
        const csv1 = e1.target.result;
        reader2.onload = function (e2) {
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

function processCSV(csv1, csv2) {
    const { header: header1, rows: rows1 } = parseCSV(csv1);
    const { header: header2, rows: rows2 } = parseCSV(csv2);

    const fullHeader = Array.from(new Set([...header1, ...header2]));

    const index1 = header1.indexOf('宛名番号');
    const index2 = header2.indexOf('宛名番号');

    const map = new Map();
    rows1.forEach(row => {
        map.set(row[index1], { ...map.get(row[index1]), ...arrayToObj(header1, row) });
    });
    rows2.forEach(row => {
        map.set(row[index2], { ...map.get(row[index2]), ...arrayToObj(header2, row) });
    });

    const output = [fullHeader.join(',')];
    map.forEach((value, key) => {
        const row = fullHeader.map(header => value[header] || '');
        output.push(row.join(','));
    });

    return output.join('\n');
}

function parseCSV(csv) {
    const lines = csv.split('\n').map(line => line.trim()).filter(line => line);
    const header = lines[0].split(',');
    const rows = lines.slice(1).map(line => line.split(','));
    return { header, rows };
}

function arrayToObj(headers, row) {
    const obj = {};
    headers.forEach((header, i) => {
        obj[header] = row[i];
    });
    return obj;
}

// 課税対象の住民を除外する処理
function handleFile() {
    const fileInput = document.getElementById('csvFile1');
    const file = fileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const text = event.target.result;
            const lines = text.split('\n').map(line => line.split(','));
            const headerIndex = lines[0].indexOf('賦課');
            if (headerIndex === -1) {
                alert('賦課列が見つかりません。');
                return;
            }

            const filteredLines = lines.filter((line, index) => {
                return index === 0 || line[headerIndex] !== '課税対象';
            });

            const output = filteredLines.map(line => line.join(',')).join('\n');
            downloadCSV(output, 'filtered.csv');
        };
        reader.readAsText(file);
    } else {
        alert('ファイルを選択してください。');
    }
}

// 世帯員の人数が1で、消除日、消除届出日、消除事由コードが入力されている行を除外する処理
function filterDeath() {
    const fileInput = document.getElementById('csvFile2');
    const file = fileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const text = event.target.result;
            const lines = text.split('\n').map(line => line.split(','));

            const headers = lines[0];
            const membersIndex = headers.indexOf('世帯員の人数');
            const removalDateIndex = headers.indexOf('消除日');
            const notificationDateIndex = headers.indexOf('消除届出日');
            const reasonCodeIndex = headers.indexOf('消除事由コード');

            if (membersIndex === -1 || removalDateIndex === -1 || notificationDateIndex === -1 || reasonCodeIndex === -1) {
                alert('必要なヘッダーが見つかりません。');
                return;
            }

            const filteredLines = lines.filter((line, index) => {
                if (index === 0) return true;
                return !(line[membersIndex] === '1' &&
                    line[removalDateIndex].trim() !== '' &&
                    line[notificationDateIndex].trim() !== '' &&
                    line[reasonCodeIndex].trim() !== '');
            });

            const output = filteredLines.map(line => line.join(',')).join('\n');
            downloadCSV(output, 'filtered_single_households.csv');
        };
        reader.readAsText(file);
    } else {
        alert('ファイルを選択してください。');
    }
}

// R5給付対象者を除外する処理
function deleteRowsByAddressNumber() {
    const file1 = document.getElementById('file3').files[0];
    const file2 = document.getElementById('file4').files[0];
    if (!file1 || !file2) {
        alert('両方のファイルを選択してください。');
        return;
    }

    const reader1 = new FileReader();
    const reader2 = new FileReader();

    reader1.onload = function (e) {
        const text1 = e.target.result;
        reader2.onload = function (e) {
            const text2 = e.target.result;
            const output = deleteRows(text1, text2);
            downloadCSV(output, 'deleted_rows.csv');
        };
        reader2.readAsText(file2);
    };
    reader1.readAsText(file1);
}

function deleteRows(csvText1, csvText2) {
    const lines1 = csvText1.split('\n').map(line => line.split(','));
    const lines2 = csvText2.split('\n').map(line => line.split(','));

    const headers1 = lines1[0];
    const headers2 = lines2[0];
    const index1 = headers1.indexOf('宛名番号');
    const index2 = headers2.indexOf('宛名番号');

    if (index1 === -1 || index2 === -1) {
        alert('宛名番号列が見つかりません。');
        return;
    }

    const addressNumbers = new Set(lines2.slice(1).map(line => line[index2].trim()));
    const filteredLines = lines1.filter((line, index) => {
        return index === 0 || !addressNumbers.has(line[index1].trim());
    });

    return filteredLines.map(line => line.join(',')).join('\n');
}

// 廃止理由が18の行を除外する処理
function filterAbolishmentReason() {
    const file1 = document.getElementById('file5').files[0];
    const file2 = document.getElementById('file6').files[0];

    if (!file1 || !file2) {
        alert('両方のファイルを選択してください。');
        return;
    }

    const reader1 = new FileReader();
    const reader2 = new FileReader();

    reader1.onload = function (e) {
        const text1 = e.target.result;
        reader2.onload = function (e) {
            const text2 = e.target.result;
            const output = filterRowsByReason(text1, text2);
            downloadCSV(output, 'filtered_abolishment.csv');
        };
        reader2.readAsText(file2);
    };
    reader1.readAsText(file1);
}

function filterRowsByReason(csvText1, csvText2) {
    const lines1 = csvText1.split('\n').map(line => line.split(','));
    const lines2 = csvText2.split('\n').map(line => line.split(','));

    const headers1 = lines1[0];
    const headers2 = lines2[0];
    const index1 = headers1.indexOf('宛名番号');
    const index2 = headers2.indexOf('宛名番号');
    const reasonIndex = headers2.indexOf('廃止理由');

    if (index1 === -1 || index2 === -1 || reasonIndex === -1) {
        alert('宛名番号列または廃止理由列が見つかりません。');
        return;
    }

    const abolishmentNumbers = new Set(
        lines2.slice(1).filter(line => line[reasonIndex].trim() === '18').map(line => line[index2].trim())
    );

    const filteredLines = lines1.filter((line, index) => {
        return index === 0 || !abolishmentNumbers.has(line[index1].trim());
    });

    return filteredLines.map(line => line.join(',')).join('\n');
}

// CSVファイルをダウンロード
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

//aaaaaaaaaaaaa
