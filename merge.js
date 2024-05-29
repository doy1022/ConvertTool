/* 1.住基情報・税情報・住民票コード・前住所地の住所コードをマージする大元の処理 */
/* うおおお */
function mergeCSV() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['file1', 'file2', 'file3', 'file4'];
    // DOM（Document Object Model）からファイルを取得し配列に格納する。fileIdsがなくなるまで繰り返し処理
    const files = fileIds.map(id => document.getElementById(id).files[0]);

    if (files.some(file => !file)) {
        alert("4つのCSVファイルをアップロードしてください。");
        return;
    }

    // FileReaderオブジェクトを生成し、各ファイルの読み込みを行う（map処理内にFileReaderの生成を含む）
    const readers = files.map(file => new FileReader());

    const results = [];

    // 生成したFileReaderで各ファイルを読み込む
    readers.forEach((reader, index) => {
        // 各ファイルの読み込みがすべて完了したタイミングでonload処理が走る（onloadイベント）
        reader.onload = function (e) {
            // 読み込んだデータをresults配列の対応する位置に保存する
            // e.target:イベントが発生したオブジェクト（=FileReaderオブジェクト自体）
            // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う（4はインプットファイル数）
            if (results.filter(result => result).length === 4) {
                try {
                    // processCSVfunctionを呼び出し、読み込んだファイル内データのマージをおこなう
                    const mergedCSV = processCSV(...results);
                    downloadCSV(mergedCSV, 'merged.csv');
                } catch (error) {
                    alert(error.message);
                }
            }
        };
        // ファイルをテキストとして読み込む
        reader.readAsText(files[index]);
    });
}

// mergeCSVから呼び出すfunction（宛名番号をキーにしてCSVファイルをマージする処理）
function processCSV(...csvFiles) {
    // 各CSVファイルを解体し、配列に格納する
    const parsedCSVs = csvFiles.map(parseCSV);
    // flatMap()メソッドを使用して、全てのヘッダーを取得する（重複なし）
    const fullHeader = Array.from(new Set(parsedCSVs.flatMap(parsed => parsed.header)));
    // 各CSVファイルの「宛名番号」カラムのインデックスを取得し、配列に保存する→各ファイルで「宛名番号」がどの位置にあるかを把握する
    const addressIndex = parsedCSVs.map(parsed => parsed.header.indexOf('宛名番号'));
    const map = new Map();
    // 各CSVデータをマッピングしマージ処理を行う
    parsedCSVs.forEach((parsed, fileIndex) => {
        parsed.rows.forEach(row => {
            const addressNumber = row[addressIndex[fileIndex]];
            map.set(addressNumber, { ...map.get(addressNumber), ...arrayToObj(parsed.header, row) });
        });
    });
    // 出力用のCSVデータを生成する
    const output = [fullHeader.join(',')];
    map.forEach(value => {
        const row = fullHeader.map(header => value[header] || '');
        output.push(row.join(','));
    });
    return output.join('\n');
}

// processCSVから呼び出すfunction（CSVファイルの解析）
function parseCSV(csv) {
    // split()メソッドを使用して、CSVファイルの行を'\n'（改行）単位で分解する→1行ずつに分かれる
    const [header, ...rows] = csv.split('\n').map(line => line.trim()).filter(line => line);
    // split()メソッドを使用して、CSVファイルヘッダー・各行を','単位で分解し、objectとして返す
    return { header: header.split(','), rows: rows.map(row => row.split(',')) };
}

// processCSVから呼び出すfunction（配列を{{項目}: {値}}のオブジェクトに変換する）
function arrayToObj(headers, row) {
    return headers.reduce((obj, header, i) => (obj[header] = row[i], obj), {});
}

/* 2.課税対象の住民を除外する処理 */
function handleFile() {
    // CSVの数が1つの時の汎用処理を呼び出す（引数：①CSVファイルのID ②コールバック関数 ③出力するファイル名）
    processSingleFile('csvFile1', text => {
        const lines = text.split('\n').map(line => line.split(','));
        const headerIndex = lines[0].indexOf('賦課');
        if (headerIndex === -1) {
            alert('賦課列が見つかりません。');
            return;
        }
        // filter処理を実施し、indexが0（要するにヘッダー行）と、「賦課」が「課税対象」ではない行をフィルタリング
        const filteredLines = lines.filter((line, index) => index === 0 || line[headerIndex] !== '課税対象');
        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return filteredLines.map(line => line.join(',')).join('\n');
    }, 'filtered.csv');
}

/* 3.R5給付対象者を、宛名番号をキーとして除外する処理 */
function deleteRowsByAddressNumber() {
    processTwoFiles('file5', 'file6', (csv1, csv2) => deleteRows(csv1, csv2, '宛名番号'), 'deleted_rows.csv');
}

// deleteRowsByAddressNumberから呼び出すfunction（一致する行の削除とCSV整形）
function deleteRows(csvText1, csvText2, key) {
    const [lines1, lines2] = [csvText1, csvText2].map(text => text.split('\n').map(line => line.split(',')));
    const [headers1, headers2] = [lines1[0], lines2[0]];
    const [index1, index2] = [headers1.indexOf(key), headers2.indexOf(key)];
    if (index1 === -1 || index2 === -1) {
        alert(`${key}列が見つかりません。`);
        return;
    }
    const keySet = new Set(lines2.slice(1).map(line => line[index2].trim()));
    const filteredLines = lines1.filter((line, index) => index === 0 || !keySet.has(line[index1].trim()));
    return filteredLines.map(line => line.join(',')).join('\n');
}

/* 4.世帯員の人数が1で、消除日、消除届出日、消除事由コードが入力されている行を除外する処理 */
function filterDeath() {
    processSingleFile('csvFile2', text => {
        const lines = text.split('\n').map(line => line.split(','));
        const headers = lines[0];
        const membersIndex = headers.indexOf('世帯員の人数');
        const removalDateIndex = headers.indexOf('消除日');
        const notificationDateIndex = headers.indexOf('消除届出日');
        const reasonCodeIndex = headers.indexOf('消除事由コード');

        if ([membersIndex, removalDateIndex, notificationDateIndex, reasonCodeIndex].includes(-1)) {
            alert('必要な列が見つかりません。');
            return;
        }

        const filteredLines = lines.filter((line, index) => {
            if (index === 0) return true; // ヘッダー行は保持する
            const [members, removalDate, notificationDate, reasonCode] = [line[membersIndex], line[removalDateIndex], line[notificationDateIndex], line[reasonCodeIndex]];
            return !(members === '1' && removalDate && notificationDate && reasonCode);
        });

        return filteredLines.map(line => line.join(',')).join('\n');
    }, 'filtered_single_households.csv');
}

/* 5.廃止事由ファイル内「廃止理由」が「18(他区課税)」の行を除外する処理 */
function deleteRowsByReason() {
    processTwoFiles('file7', 'file8', (csv1, csv2) => filterByReason(csv1, csv2), 'filtered_reason.csv');
}

function filterByReason(csvText1, csvText2) {
    const [lines1, lines2] = [csvText1, csvText2].map(text => text.split('\n').map(line => line.split(',')));
    const [headers1, headers2] = [lines1[0], lines2[0]];
    const [index1, index2, reasonIndex] = [headers1.indexOf('宛名番号'), headers2.indexOf('宛名番号'), headers2.indexOf('廃止理由')];

    if ([index1, index2, reasonIndex].includes(-1)) {
        alert('宛名番号または廃止理由列が見つかりません。');
        return;
    }

    const keySet = new Set(lines2.slice(1).filter(line => line[reasonIndex].trim() === '18').map(line => line[index2].trim()));
    const filteredLines = lines1.filter((line, index) => index === 0 || !keySet.has(line[index1].trim()));

    return filteredLines.map(line => line.join(',')).join('\n');
}

/* 6.賦課項目に値がある行を除外する（税情報無しの住民を抽出する）処理 */
function deleteRowsWithAssessment() {
    processSingleFile('file9', text => {
        const lines = text.split('\n').map(line => line.split(','));
        const headers = lines[0];
        const assessmentIndex = headers.indexOf('賦課');
        if (assessmentIndex === -1) {
            alert('賦課列が見つかりません。');
            return;
        }
        const filteredLines = lines.filter((line, index) => index === 0 || !line[assessmentIndex].trim());
        return filteredLines.map(line => line.join(',')).join('\n');
    }, 'filtered_assessment.csv');
}

/* 7.住所コードの更新処理 （作成中）*/
function updateAddressCode() {
    processSingleFile('file11', text => {
        const lines = text.split('\n').map(line => line.split(','));
        const headers = lines[0];
        const codeIndex = headers.indexOf('住所コード');
        if (codeIndex === -1) {
            alert('住所コード列が見つかりません。');
            return;
        }
        const updatedLines = lines.map((line, index) => {
            if (index === 0) return line; // ヘッダー行はそのまま
            line[codeIndex] = '新しいコード'; // ここで新しい住所コードを設定
            return line;
        });
        return updatedLines.map(line => line.join(',')).join('\n');
    }, 'updated_address_code.csv');
}

/* 8. 税情報照会用ファイルを出力する処理 */
function generateFixedLengthFile() {
    processSingleFile('file10', text => {
        const lines = text.split('\n').map(line => line.split(','));
        const headers = lines[0];

        // アウトプット用のカラムを個別に定義する。プロパティでカラム長、該当する項目、埋め値、固定値（あれば）を定義
        const column1 = { length: 2, name: '番号体系', padding: '0', value: '01' };
        const column2 = { length: 15, name: '宛名番号', padding: '0' };
        const column3 = { length: 15, name: '統合宛名番号', padding: ' ' };
        const column4 = { length: 17, name: '照会依頼日時', padding: ' ' };
        const column5 = { length: 20, name: '情報照会者部署コード', padding: ' ', value: '3595115400' };
        const column6 = { length: 20, name: '情報照会者ユーザーID', padding: ' ' };
        const column7 = { length: 16, name: '情報照会者機関コード', padding: ' ', value: '0220113112101700' };
        const column8 = { length: 1, name: '照会側不開示コード', padding: ' ', value: '1' };
        const column9 = { length: 16, name: '事務コード', padding: ' ', value: 'JM01000000121000' };
        const column10 = { length: 16, name: '事務手続きコード', padding: ' ', value: 'JT01010000000214' };
        const column11 = { length: 16, name: '情報照会者機関コード（委任元）', padding: ' ' };
        const column12 = { length: 16, name: '情報提供者機関コード（委任元）', padding: ' ' };
        const column13 = { length: 16, name: '情報提供者機関コード', padding: ' ' };
        const column14 = { length: 16, name: '特定個人情報名コード', padding: ' ', value: 'TM00000000000002' };
        const column15 = { length: 1, name: '照会条件区分', padding: ' ', value: '0' };
        const column16 = { length: 1, name: '照会年度区分', padding: ' ', value: '0' };
        const column17 = { length: 8, name: '照会開始日付', padding: ' ' };
        const column18 = { length: 8, name: '照会終了日付', padding: ' ' };
        // 全カラムを配列にまとめる
        const columnDefinitions = [column1, column2, column3, column4, column5, column6, column7, column8, column9,
            column10, column11, column12, column13, column14, column15, column16, column17, column18];

        return lines.slice(1).map(line => {
            return columnDefinitions.map(colDef => {
                const value = colDef.value || line[headers.indexOf(colDef.name)] || '';
                return value.padStart(colDef.length, colDef.padding).substring(0, colDef.length);
            }).join('');
        }).join('\n');
    }, 'fixed_length.csv');
}

/* 以下、使いまわすメソッド（汎用処理）*/
/* 単一ファイル処理の汎用関数 */
function processSingleFile(fileId, processFunc, outputFilename) {
    const file = document.getElementById(fileId).files[0];
    if (!file) {
        alert("CSVファイルをアップロードしてください。");
        return;
    }
    const reader = new FileReader();
    // 読み込んだデータをresults配列の対応する位置に保存する
    // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
    reader.onload = function (e) {
        const processedText = processFunc(e.target.result);
        if (processedText) {
            downloadCSV(processedText, outputFilename);
        }
    };
    reader.readAsText(file);
}

/* 二つのファイル処理の汎用関数 */
function processTwoFiles(fileId1, fileId2, processFunc, outputFilename) {
    const file1 = document.getElementById(fileId1).files[0];
    const file2 = document.getElementById(fileId2).files[0];

    if (!file1 || !file2) {
        alert("2つのCSVファイルをアップロードしてください。");
        return;
    }

    const reader1 = new FileReader();
    const reader2 = new FileReader();

    let text1, text2;

    reader1.onload = function (e) {
        text1 = e.target.result;
        if (text2) {
            const processedText = processFunc(text1, text2);
            if (processedText) {
                downloadCSV(processedText, outputFilename);
            }
        }
    };

    reader2.onload = function (e) {
        text2 = e.target.result;
        if (text1) {
            const processedText = processFunc(text1, text2);
            if (processedText) {
                downloadCSV(processedText, outputFilename);
            }
        }
    };

    reader1.readAsText(file1);
    reader2.readAsText(file2);
}

/* CSVファイルのダウンロード処理 */
function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}