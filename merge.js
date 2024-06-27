/* 定数定義 */
const LOG_LEVEL = 'debug'; // Log出力のレベルを選択（debug, info, warn, error）
const MIDDLE_FILE_0 = "中間ファイル⓪.csv";
const MIDDLE_FILE_1 = "中間ファイル①.csv";
const MIDDLE_FILE_2 = "中間ファイル②.csv";
const MIDDLE_FILE_3 = "中間ファイル③.csv";
const MIDDLE_FILE_4 = "中間ファイル④.csv";
const MIDDLE_FILE_5 = "中間ファイル⑤.csv";
const MIDDLE_FILE_6 = "中間ファイル⑥.csv";
const RESIDENTINFO_INQUIRY_FILE_1 = "住基照会用ファイル①.csv";
const RESIDENTINFO_INQUIRY_FILE_2 = "住基照会用ファイル②.csv";
const NATURALIZED_CITIZEN_FILE = '帰化対象者.csv';
const NUMBER_OF_DATA_DIVISION = 10000; // 税情報データ分割数

// todo カラム不備のエラハン
/* 0.課税区分を判定するために賦課マスタ・個人基本マスタをマージする処理 */
function mergeTaxCSV() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['LevyMaster', 'PersonalMaster'];
    // 各ファイルのIDを配列に格納する
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 0 処理を開始しました');
    //showLoading();

    // map処理でファイル分のFileReaderオブジェクトを生成し、ファイルの読み込みを行う
    const readers = files.map(file => new FileReader());
    const results = [];

    // 各ファイルを順に読み込み、読み込みが完了したタイミングでonload処理が走る（onloadイベント）
    readers.forEach((reader, index) => {
        reader.onload = function (e) {
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う
            if (results.filter(result => result).length === file_num) {
                try {
                    // 読み込んだファイル内データのマージをおこなう
                    const mergedCSV = ProcessingDataTakenFromCSV(...results);
                    downloadCSV(mergedCSV, MIDDLE_FILE_0);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 0 処理を終了しました');
                    // hideLoading();
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function ProcessingDataTakenFromCSV(...csvFiles) {
        // 各CSVファイルをヘッダーとデータ行に分解し、1行ずつ配列に格納する
        const parsedCSVs = csvFiles.map(csv => parseCSV(csv));

        // 各ファイルヘッダー内の「ＦＩ－」を取り除く
        parsedCSVs.forEach(parsed => parsed.header = removeStrFromHeader(parsed.header, "ＦＩ－"));
        // 各CSVファイルの「宛名番号」カラムのインデックスを取得し、配列に保存する→各ファイルで「宛名番号」がどの位置にあるかを把握する
        const addressIndex = parsedCSVs.map(parsed => parsed.header.indexOf('宛名番号'));

        // 1つ目のCSVデータを基準にマッピングしマージ処理を行う
        const map = new Map();
        parsedCSVs[0].rows.forEach(row => {
            const addressNumber = row[addressIndex[0]];
            // headersとrowからオブジェクトを生成する
            const rowObj = parsedCSVs[0].header.reduce((obj, header, i) => {
                obj[header] = row[i];
                return obj;
            }, {});
            map.set(addressNumber, rowObj);
        });

        // 住基情報に存在しない宛名番号を格納する変数
        let nonExistingAddresseeNumber = [];
        let nonExistingAddresseeNumberMap = new Map();
        // 他のCSVデータをマッピングしマージ処理を行う
        for (let fileIndex = 1; fileIndex < parsedCSVs.length; fileIndex++) {
            parsedCSVs[fileIndex].rows.forEach(row => {
                const addressNumber = row[addressIndex[fileIndex]];
                if (map.has(addressNumber)) {
                    // headersとrowからオブジェクトを生成する
                    const rowObj = parsedCSVs[fileIndex].header.reduce((obj, header, i) => {
                        obj[header] = row[i];
                        return obj;
                    }, {});
                    map.set(addressNumber, { ...map.get(addressNumber), ...rowObj });
                } else {
                    nonExistingAddresseeNumberMap.set(addressNumber, addressNumber);
                }
            });
        }

        nonExistingAddresseeNumberMap.forEach(function (value, key) {
            nonExistingAddresseeNumber.push(value);
        });
        // 住基情報に存在しない宛名番号を表示
        if (nonExistingAddresseeNumber.length > 0) {
            logger.warn("個人基本マスタに存在するが、賦課マスタに存在しない宛名番号が検出されました。\n件数：" + nonExistingAddresseeNumber.length);
            downloadCSV(nonExistingAddresseeNumber.join('\r\n'), "個人基本マスタに存在するが、賦課マスタに存在しない宛名番号.csv");
        }

        // 条件ごとに課税区分を入力する
        map.forEach((value) => {
            // 条件分岐に使用するカラムの値を定義する
            const incomePercentage = Number(value['所得割額']);
            const equalPercentage = Number(value['均等割額']);
            const causeForCorrection = String(value['更正事由']);
            // 「所得割額」が0かつ、「均等割額」が0かつ、「更正事由」の先頭２桁が03でないものを非課税(1)判定
            if (incomePercentage == 0 && equalPercentage == 0 && !causeForCorrection.startsWith("03")) {
                value['課税区分'] = '1';
                // 「所得割額」が0かつ、「均等割額」が1以上かつ、「更正事由」の先頭２桁が03でないものを均等割りのみ課税(2)判定
            } else if (incomePercentage == 0 && equalPercentage > 0 && !causeForCorrection.startsWith("03")) {
                value['課税区分'] = '2';
                // 「所得割額」が1以上かつ、「均等割額」が1以上かつ、「更正事由」の先頭２桁が03でないものを課税(3)判定
            } else if (incomePercentage > 0 && equalPercentage > 0 && !causeForCorrection.startsWith("03")) {
                value['課税区分'] = '3';
                // 「所得割額」が1以上のときは「均等割額」が1以上になるはずのため、「均等割額」が0のものはエラーとして投げる
            } else if (incomePercentage > 0 && equalPercentage == 0 && !causeForCorrection.startsWith("03")) {
                throw new Error('【宛名番号：' + String(value['宛名番号']) + 'の課税情報】\n「所得割額」が1以上ですが「均等割額」が0となっております。インプットファイルを確認してください。')
                // 「更正事由」の先頭２桁が03であるものは、「所得割額」「所得割額」に関わらず未申告(4)判定
            } else if (causeForCorrection.startsWith("03")) {
                value['課税区分'] = '4';
            } else {
                value['課税区分'] = '';
            }
        });

        // アウトプットファイルのカラムを指定する
        const selectedColumns = ['宛名番号', '所得割額', '均等割額', '課税区分', '更正事由', '生年月日'];
        const outputHeader = selectedColumns.join(',');

        const outputRows = [];
        map.forEach(value => {
            const row = selectedColumns.map(header => value[header] || '');
            outputRows.push(row.join(','));
        });

        const output = [outputHeader, ...outputRows];
        return output.join('\r\n') + '\r\n';
    }
}

// todo カラム不備のエラハン
/* 1.住基情報・税情報・住民票コード・前住所地の住所コードをマージする大元の処理 */
function mergeCSV() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['file1', 'file2', 'file3', 'file4'];
    // 各ファイルのIDを配列に格納する
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 税情報ファイルとして、「中間ファイル⓪」がインプットされたことを確認する（前方一致で確認）
    if (!files[1].name.startsWith('中間ファイル⓪')) {
        alert('税情報ファイルとしてアップロードするファイル名は「中間ファイル⓪.csv」にして下さい。');
        return; // ファイル名が「中間ファイル⓪」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 1 処理を開始しました');

    // FileReaderオブジェクトを生成し、各ファイルの読み込みを行う（map処理内にFileReaderの生成を含む）
    const readers = files.map(file => new FileReader());
    const results = [];

    // 各ファイルを順に読み込む
    readers.forEach((reader, index) => {
        // ファイルの読み込みが完了したタイミングでonload処理が走る（onloadイベント）
        reader.onload = function (e) {
            // 読み込んだデータをresults配列に保存する
            // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う
            if (results.filter(result => result).length === file_num) {
                try {
                    // 読み込んだファイル内データのマージをおこなう
                    const mergedCSV = processCSV(...results);
                    downloadCSV(mergedCSV, MIDDLE_FILE_1);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 1 処理を終了しました');
                }
            }
        };

        // onloadイベントを発火
        reader.readAsText(files[index]);
    });

    // マージ処理用function
    function processCSV(...csvFiles) {
        // 各CSVファイルをヘッダーとデータ行に分解し、1行ずつ配列に格納する
        const parsedCSVs = csvFiles.map(csv => parseCSV(csv));
        // 住基情報ヘッダー内の「ＦＯ－」を取り除く
        parsedCSVs[0].header = removeStrFromHeader(parsedCSVs[0].header, "ＦＯ－");
        // 税情報ヘッダー内の「ＦＩ－」を取り除く
        parsedCSVs[1].header = removeStrFromHeader(parsedCSVs[1].header, "ＦＩ－");
        // 各CSVファイルのヘッダーを統合して（flatMap）一意なヘッダー（Set）のリストを作成
        const fullHeader = Array.from(new Set(parsedCSVs.flatMap(parsed => parsed.header)));
        // 各CSVファイルの「宛名番号」カラムのインデックスを取得し、配列に保存する→各ファイルで「宛名番号」がどの位置にあるかを把握する
        const addressIndex = parsedCSVs.map(parsed => parsed.header.indexOf('宛名番号'));
        // 出力用のCSVデータを定義する
        const output = [fullHeader.join(',')];

        // 1つ目のファイル（住基情報）を基準にマッピングしマージ処理を行う
        const map = new Map();
        parsedCSVs[0].rows.forEach(row => {
            const addressNumber = row[addressIndex[0]];
            // headersとrowからオブジェクトを生成する
            const rowObj = parsedCSVs[0].header.reduce((obj, header, i) => {
                obj[header] = row[i];
                return obj;
            }, {});
            map.set(addressNumber, rowObj);
        });

        // 住基情報に存在しない宛名番号を格納する変数 //
        // 1:税情
        // 2.住民票コード、
        // 3.前住所地の住所コード
        let nonExistingAddresseeNumber1 = [];
        let nonExistingAddresseeNumberMap1 = new Map();
        let nonExistingAddresseeNumber2 = [];
        let nonExistingAddresseeNumberMap2 = new Map();
        let nonExistingAddresseeNumber3 = [];
        let nonExistingAddresseeNumberMap3 = new Map();
        // 他のCSVデータをマッピングしマージ処理を行う
        for (let fileIndex = 1; fileIndex < parsedCSVs.length; fileIndex++) {
            parsedCSVs[fileIndex].rows.forEach(row => {
                const addressNumber = row[addressIndex[fileIndex]];
                if (map.has(addressNumber)) {
                    // headersとrowからオブジェクトを生成する
                    const rowObj = parsedCSVs[fileIndex].header.reduce((obj, header, i) => {
                        obj[header] = row[i];
                        return obj;
                    }, {});
                    map.set(addressNumber, { ...map.get(addressNumber), ...rowObj });
                } else {
                    if (fileIndex == 1) {
                        nonExistingAddresseeNumberMap1.set(addressNumber, addressNumber);
                    } else if (fileIndex == 2) {
                        nonExistingAddresseeNumberMap2.set(addressNumber, addressNumber);
                    } else if (fileIndex == 3) {
                        nonExistingAddresseeNumberMap3.set(addressNumber, addressNumber);
                    }

                }
            });
        }
        nonExistingAddresseeNumberMap1.forEach(function (value, key) {
            nonExistingAddresseeNumber1.push(value);
        });
        nonExistingAddresseeNumberMap2.forEach(function (value, key) {
            nonExistingAddresseeNumber2.push(value);
        });
        nonExistingAddresseeNumberMap3.forEach(function (value, key) {
            nonExistingAddresseeNumber3.push(value);
        });
        // 住基情報に存在しない宛名番号を表示
        if (nonExistingAddresseeNumber1.length > 0) {
            logger.warn("税情報に存在するが、住基情報に存在しない宛名番号が検出されました。\n件数：" + nonExistingAddresseeNumber1.length);
            downloadCSV(nonExistingAddresseeNumber1.join('\r\n'), "税情報に存在するが、住基情報に存在しない宛名番号.csv");
        }
        if (nonExistingAddresseeNumber2.length > 0) {
            logger.warn("住民票コードに存在するが、住基情報に存在しない宛名番号が検出されました。\n件数：" + nonExistingAddresseeNumber2.length);
            downloadCSV(nonExistingAddresseeNumber2.join('\r\n'), "住民票コードに存在するが、住基情報に存在しない宛名番号.csv");
        }
        if (nonExistingAddresseeNumber3.length > 0) {
            logger.warn("前住所地の住所コードに存在するが、住基情報に存在しない宛名番号が検出されました。\n件数：" + nonExistingAddresseeNumber3.length);
            downloadCSV(nonExistingAddresseeNumber3.join('\r\n'), "前住所地の住所コードに存在するが、住基情報に存在しない宛名番号.csv");
        }

        map.forEach(value => {
            const row = fullHeader.map(header => value[header] || '');
            output.push(row.join(','));
        });
        return output.join('\r\n') + '\r\n';
    }
}

/* 2.課税対象の住民を除外する処理・消除者を除外する処理・住民日がR6.6.4~の住民を除外する処理 */
function handleFile() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['midFile1'];
    // 各ファイルのIDを配列に格納する
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル①」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル①')) {
        alert('アップロードするファイル名を「中間ファイル①」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル①」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 2 処理を開始しました');

    // 読み込んだデータをresults配列の対応する位置に保存する
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
            let text = e.target.result;

            // 必要なヘッダーがあるかチェック
            const { header, rows } = parseCSV(text);
            const requiredColumns = [
                '消除日',
                '消除事由コード',
                '住民日',
                '続柄１',
                '宛名番号',
                '世帯番号',
                '課税区分'
            ];
            // カラムのインデックスを取得
            const columnIndices = requiredColumns.map(col => header.indexOf(col));
            // 足りないカラムをチェック
            const missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

            if (missingColumns.length > 0) {
                throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
            }

            // 課税対象の住民を除外する処理
            const filterTaxExcludedText = filterTaxExcluded(text);
            if (!filterTaxExcludedText) {
                logger.warn("出力対象レコードが存在しませんでした。");
            } else {
                //消除住民を除外する処理・住民日がR6.6.4~の住民を除外する処理
                const filterDeathText = filterDeath(filterTaxExcludedText, columnIndices)
                if (!filterDeathText) {
                    logger.warn("出力対象レコードが存在しませんでした。");
                } else {
                    downloadCSV(filterDeathText, MIDDLE_FILE_2);
                }
            }
        } catch (error) {
            // catchしたエラーを表示
            logger.error(error);
        } finally {
            logger.info('STEP 2 処理を終了しました');
        }
    };
    // onloadイベントを発火
    reader.readAsText(files[0]);

    /* 消除世帯を除外する処理・世帯主の住民日がR6.6.4~の世帯を除外する処理 */
    /* 上記条件で対象世帯主を抽出・世帯番号を取得し世帯員のレコードをすべて除外する */
    function filterDeath(text, columnIndices) {
        // ヘッダーとレコード行に分割
        const { header, rows } = parseCSV(text);
        // 日付比較用に、20240604をdate型にする
        const targetDate = new Date('2024-06-04 00:00:00');
        // 死亡による全員消除判定用の消除事由コード（これに含まれていると除外対象になる）
        const deathReasonCode = ['B12', 'B22'];
        // 死亡以外による全員消除判定用の消除事由コード（これに含まれているかつ消除日がR6.6.4以降だと除外対象になる）
        const nonDeathReasonCode = ['B02', 'B32', 'B42', 'B52', 'B62', 'B72', 'BD2', 'BE2', 'BF2', 'BL2', 'BM2'];
        // 死亡による全員消除判定用の消除事由コード（これに含まれている世帯主がいる場合、世帯は未申告扱いになる）
        const partOfDeathReasonCode = ['B11', 'B21'];
        // 死亡以外による全員消除判定用の消除事由コード（これに含まれている世帯主がいるかつ消除日がR6.6.4以前の場合、世帯は未申告扱いになる）
        const partOfNonDeathReasonCode = ['B01', 'B31', 'B41', 'B51', 'B61', 'B71', 'BD1', 'BE1', 'BF1', 'BL1', 'BM1'];
        // 除外対象の世帯番号の値を収集するためのセット
        const excludedHouseholdNumSet = new Set();

        // 一次フィルター：除外対象の世帯主レコードを取得する
        rows.forEach(line => {
            const [removalDate, reasonCode, residentsdate, familyRelationship] = [
                line[columnIndices[0]],
                line[columnIndices[1]],
                line[columnIndices[2]],
                line[columnIndices[3]],
            ];

            // 住民日が空だと日付比較が出来ないため、存在有無を確認する
            if (!residentsdate) {
                throw new Error('【宛名番号：' + line[columnIndices[4]] + '】\n「住民日」列が空です。インプットファイルの確認をお願いします。');
            }

            // 住民日・消除日を日付型に変換する。どちらも「yyyymmdd」形式（8桁）で入力されているので、「parseDate」で一度分割して「年,月,日」の形式にしてからDate型に変換する
            const residentsDateObj = parseDate(residentsdate);
            const removalDateObj = parseDate(removalDate);

            function parseDate(yyyymmdd) {
                const year = yyyymmdd.substring(0, 4);
                const month = yyyymmdd.substring(4, 6) - 1;
                const day = yyyymmdd.substring(6, 8);
                return new Date(year, month, day);
            }

            // 除外条件がわかりづらいため変数として定義する
            // 続柄が「02（世帯主）」かつ、住民日がR6.6.3よりあとであるレコード
            const condition1 = familyRelationship === '02' && residentsDateObj >= targetDate;
            // 消除事由が「「死亡申出（全部）」「死亡通知（全部）」のいずれかであるレコード
            const condition2 = deathReasonCode.includes(reasonCode);
            // 消除事由が、死亡以外の「～（全部）」いずれかで、かつ消除日がR6.6.3より前であるレコード
            const condition3 = nonDeathReasonCode.includes(reasonCode) && removalDateObj < targetDate;

            // 抽出判定を実施する
            const judge = condition1 || condition2 || condition3;

            // 除外対象となる世帯番号を収集する
            if (judge) {
                excludedHouseholdNumSet.add(line[columnIndices[5]]);
            }
        });

        // 二次フィルター：一次フィルターで取得した除外対象の世帯番号を使用し、対象外世帯の世帯員レコードを全て除外する
        const secondaryFilteredLines = rows.filter(line => {
            const householdNum = line[columnIndices[5]];
            return !excludedHouseholdNumSet.has(householdNum);
        });

        // 三次フィルター：世帯主が死亡、または他の消除をしている世帯を抽出し、申請書の対象とする（＝課税区分を「4」にする）
        const finalFilteredLines = secondaryFilteredLines.map(line => {
            const [removalDate, reasonCode, familyRelationship] = [
                line[columnIndices[0]],
                line[columnIndices[1]],
                line[columnIndices[3]],
            ];

            // 消除日を日付型に変換する。どちらも「yyyymmdd」形式（8桁）で入力されているので、「parseDate」で一度分割して「年,月,日」の形式にしてからDate型に変換する
            const removalDateObj = parseDate(removalDate);

            function parseDate(yyyymmdd) {
                const year = yyyymmdd.substring(0, 4);
                const month = yyyymmdd.substring(4, 6) - 1;
                const day = yyyymmdd.substring(6, 8);
                return new Date(year, month, day);
            }

            // 続柄が「02（世帯主）」かつ、消除事由が「「死亡申出（一部）」「死亡通知（一部）」のいずれかであるレコード
            const condition1 = familyRelationship === '02' && partOfDeathReasonCode.includes(reasonCode);
            // 続柄が「02（世帯主）」かつ、消除事由が死亡以外の「～（一部）」のいずれかかつ、消除日がR6.6.3より前であるレコード
            const condition2 = familyRelationship === '02' && partOfNonDeathReasonCode.includes(reasonCode) && removalDateObj < targetDate;

            // 抽出判定を実施する
            const judge = condition1 || condition2

            // 除外対象となる世帯番号を収集する
            if (judge) {
                line[columnIndices[6]] = '4';
            }

            return line;
        });

        return [header.join(','), ...finalFilteredLines.map(line => line.join(','))].join('\r\n') + '\r\n';
    }
}

/* 3.R5給付対象者を、宛名番号・世帯番号をキーとして除外する処理 */
function deleteRowsByAddressNumber() {
    const fileIds = ['file5', 'file6'];
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル②」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル②')) {
        alert('アップロードするファイル名を「中間ファイル②」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル②」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 3 処理を開始しました');

    // map処理でファイル分のFileReaderオブジェクトを生成し、ファイルの読み込みを行う
    const readers = files.map(file => new FileReader());
    const results = [];

    // 各ファイルを順に読み込み、読み込みが完了したタイミングでonload処理が走る（onloadイベント）
    readers.forEach((reader, index) => {
        reader.onload = function (e) {
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う
            if (results.filter(result => result).length === file_num) {
                try {
                    const mergedCSV = deleteRows(results[0], results[1], ['宛名番号', '世帯番号']);
                    downloadCSV(mergedCSV, MIDDLE_FILE_3);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 3 処理を終了しました');
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function deleteRows(csvText1, csvText2, keys) {
        // CSVテキストを行ごとに分割して配列に変換
        const arrayFromMidFile = parseCSV(csvText1);
        const arrayFromR5BeneficiaryList = parseCSV(csvText2);

        // ヘッダー行を取得
        const midFileHeader = arrayFromMidFile.header;
        const r5BeneficiaryListHeader = arrayFromR5BeneficiaryList.header;

        // 各キーのインデックスを取得
        const addressNumIndex1 = midFileHeader.indexOf(keys[0]); // 宛名番号のインデックス（中間ファイル②）
        const householdNumIndex1 = midFileHeader.indexOf(keys[1]); // 世帯番号のインデックス（中間ファイル②）
        const addressNumIndex2 = r5BeneficiaryListHeader.indexOf(keys[0]); // 宛名番号のインデックス（R5給付対象者ファイル）
        const householdNumIndex2 = r5BeneficiaryListHeader.indexOf(keys[1]); // 世帯番号のインデックス（R5給付対象者ファイル）

        // エラーハンドリング（必要なカラムが存在しない場合、ファイル名とカラムを表示する）
        const missingColumns = [];
        if (addressNumIndex1 === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：' + keys[0]);
        }
        if (householdNumIndex1 === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：' + keys[1]);
        }
        if (addressNumIndex2 === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：' + keys[0]);
        }
        if (householdNumIndex2 === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：' + keys[1]);
        }

        if (missingColumns.length > 0) {
            throw new Error('以下のカラムが見つかりません。ファイルの確認をお願いします。\n' + missingColumns.join('\n'));
        }

        // 一次フィルター：除外対象の住民レコードを、宛名番号をキーにして取得する
        // R5給付対象者のCSVファイルの宛名番号セットを作成する
        const addressNumberSet = new Set(arrayFromR5BeneficiaryList.rows.map(line => line[addressNumIndex2].trim().padStart(10, '0')));
        // 除外対象の世帯番号の値を収集するためのセットを作成する
        const excludedHouseholdNumSet = new Set(arrayFromR5BeneficiaryList.rows.map(line => line[householdNumIndex2].trim().padStart(10, '0')));

        // 中間ファイルから、宛名番号セット内の値と一致する宛名番号を持つ行（除外対象行）を抽出する
        const primaryFilteredLines = arrayFromMidFile.rows.filter((line) => {
            const addressNumber = line[addressNumIndex1].trim();
            const judge = addressNumberSet.has(addressNumber);

            // 中間ファイルから、除外対象となる世帯番号の値を収集する
            if (judge) {
                excludedHouseholdNumSet.add(line[householdNumIndex1]);
            }

            return judge;
        });

        // 二次フィルター：一次フィルターで取得した除外対象の世帯番号を使用し、対象外世帯の世帯員レコードを全て除外する
        const secondaryFilteredLines = arrayFromMidFile.rows.filter(line => {
            const householdNum = line[householdNumIndex1].trim();
            return !excludedHouseholdNumSet.has(householdNum);
        });

        // フィルタリングされた行をCSV形式に戻す
        return [midFileHeader, ...secondaryFilteredLines].map(line => line.join(',')).join('\r\n') + '\r\n';
    }
}

/* 4.廃止事由ファイル内「廃止理由」が「18(他区課税)」の行を除外し、「21(非居住海外)」の行を「未申告」とする（給付対象とする）処理 */
function deleteRowsByReason() {
    const fileIds = ['file7', 'file8'];
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル②」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル③')) {
        alert('アップロードするファイル名を「中間ファイル③」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル③」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 4 処理を開始しました');

    // map処理でファイル分のFileReaderオブジェクトを生成し、ファイルの読み込みを行う
    const readers = files.map(file => new FileReader());
    const results = [];

    // 各ファイルを順に読み込み、読み込みが完了したタイミングでonload処理が走る（onloadイベント）
    readers.forEach((reader, index) => {
        reader.onload = function (e) {
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う
            if (results.filter(result => result).length === file_num) {
                try {
                    const mergedCSV = filterByReason(results[0], results[1]);
                    downloadCSV(mergedCSV, MIDDLE_FILE_4);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 4 処理を終了しました');
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function filterByReason(csvText1, csvText2) {
        // CSVテキストを行ごとに分割して配列に変換
        const arrayFromMidFile = parseCSV(csvText1);
        const arrayFromReasonForAbolitionList = parseCSV(csvText2);

        // ヘッダー行を取得
        const midFileHeader = arrayFromMidFile.header;
        const reasonForAbolitionheader = arrayFromReasonForAbolitionList.header;

        // 必要な列のインデックスを取得
        const addressNumIndex1 = midFileHeader.indexOf('宛名番号');
        const taxClassIndex = midFileHeader.indexOf('課税区分');
        const addressNumIndex2 = reasonForAbolitionheader.indexOf('宛名番号');
        const reasonIndex = reasonForAbolitionheader.indexOf('廃止理由');

        // エラーハンドリング（必要なカラムが存在しない場合、ファイル名とカラムを表示する）
        const missingColumns = [];
        if (addressNumIndex1 === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：宛名番号');
        }
        if (taxClassIndex === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：課税区分');
        }
        if (addressNumIndex2 === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：宛名番号');
        }
        if (reasonIndex === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：廃止理由');
        }

        if (missingColumns.length > 0) {
            throw new Error('以下のカラムが見つかりません。ファイルの確認をお願いします。\n' + missingColumns.join('\n'));
        }

        // arrayFromReasonForAbolitionList内の、廃止理由が「18」である行の宛名番号をセットに格納
        const keySetFor18 = new Set(arrayFromReasonForAbolitionList.rows
            .filter(line => line[reasonIndex].trim() === '18')
            .map(line => line[addressNumIndex2].trim())
        );

        // arrayFromReasonForAbolitionList内の、廃止理由が「21」である行の宛名番号をマップに格納
        const keyMapFor21 = new Map(arrayFromReasonForAbolitionList.rows
            .filter(line => line[reasonIndex].trim() === '21')
            .map(line => [line[addressNumIndex2].trim(), line])
        );

        const filteredRows = arrayFromMidFile.rows.filter(line => {
            const addressNum = line[addressNumIndex1].trim();
            if (keySetFor18.has(addressNum)) {
                // 廃止理由が「18」の場合、行を削除する
                return false;
            } else if (keyMapFor21.has(addressNum)) {
                // 廃止理由が「21」の場合、課税区分カラムの値を「未申告(4)」に更新する
                line[taxClassIndex] = '4';
            }
            return true;
        });

        // フィルタリングされた行をCSV形式に戻す
        return [midFileHeader, ...filteredRows].map(line => line.join(',')).join('\r\n') + '\r\n';
    }
}

/* 5.「情報提供者機関コード」カラムを追加し、「前住所コード」をもとに値を入力する処理*/
/* 20240617_機関コードへの変換処理が不要となったためコメントアウト（また条件が変更されるかもしれないため、物理削除はしない）
/*function ChangeRowsFromInstitutionCode() {
    const fileIds = ['file11', 'file12'];
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 処理開始log
    logger.info('STEP 5 処理を開始しました');

    // map処理でファイル分のFileReaderオブジェクトを生成し、ファイルの読み込みを行う
    const readers = files.map(file => new FileReader());
    const results = [];

    // 各ファイルを順に読み込み、読み込みが完了したタイミングでonload処理が走る（onloadイベント）
    readers.forEach((reader, index) => {
        reader.onload = function (e) {
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う
            if (results.filter(result => result).length === file_num) {
                try {
                    const mergedCSV = updateAddressCode(results[0], results[1]);
                    downloadCSV(mergedCSV, MIDDLE_FILE_5);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 5 処理を終了しました');
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function updateAddressCode(csvText1, csvText2) {
        // CSVテキストを行ごとに分割して配列に変換
        const arrayFromMidFile = parseCSV(csvText1);
        const arrayFromInstitutionCode = parseCSV(csvText2);

        // ヘッダー行を取得
        const midFileHeader = arrayFromMidFile.header;
        const InstitutionCodeheader = arrayFromInstitutionCode.header;

        // 必要な列のインデックスを取得
        const addressCodeIndex = midFileHeader.indexOf('転入元都道府県市区町村コード');
        const idCodeIndex = InstitutionCodeheader.indexOf('既存の識別コード');
        const agencyCodeIndex = InstitutionCodeheader.indexOf('機関コード');

        // エラーハンドリング（必要なカラムが存在しない場合、ファイル名とカラムを表示する）
        const missingColumns = [];
        if (addressCodeIndex === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：転入元都道府県市区町村コード');
        }
        if (idCodeIndex === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：既存の識別コード');
        }
        if (agencyCodeIndex === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：機関コード');
        }

        if (missingColumns.length > 0) {
            throw new Error('以下のカラムが見つかりません。ファイルの確認をお願いします。\n' + missingColumns.join('\n'));
        }

        // 中間ファイルのヘッダーに「情報提供者機関コード」カラムを新規作成する
        midFileHeader.push('情報提供者機関コード');

        // 既存の識別コードと機関コードのマッピングを作成
        const idCodeMap = new Map();
        arrayFromInstitutionCode.rows.forEach(line => {
            const idCode = line[idCodeIndex];
            const agencyCode = line[agencyCodeIndex];
            idCodeMap.set(idCode, agencyCode);
        });

        // 中間ファイルの各行を更新
        const updatedRows = arrayFromMidFile.rows.map((line, index) => {
            const addressCode = line[addressCodeIndex];
            const agencyCode = idCodeMap.get(addressCode) || '';
            line.push(agencyCode);
            return line;
        });

        // 更新された行をCSV形式で結合して返す
        return [midFileHeader, ...updatedRows].map(line => line.join(',')).join('\n');
    }
}*/

/* 5.①課税区分に値がある行除外 ②前住所コードの値による行除外 ③異動事由コードの値による行除外 ④税情報照会用ファイル（固定長形式）を出力する処理 */
function deleteRowAndGenerateInquiryFile() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['file9'];
    // 出力ファイル名を定義する
    const noTaxinfoFile = "P640R110_" + getCurrentTime().replace(/[:.\-\s]/g, '').trim().slice(0, 14); // 税情報照会用ファイル（YYYYMMDDHHmmssの14桁）
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル④」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル④')) {
        alert('アップロードするファイル名を「中間ファイル④」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル④」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 5 処理を開始しました');
    //showLoading();

    // 読み込んだデータをresults配列の対応する位置に保存する
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            // 全ての処理が完了したら、結果をダウンロードする
            let filteredTextFlg = false;
            let filterPreviousPrefectCodeTextFlg = false;
            let filterNaturalizedCitizenTextFlg = false;

            // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
            let text = e.target.result;

            // 必要なヘッダーがあるかチェック
            const { header, rows } = parseCSV(text);
            var requiredColumns = [
                '宛名番号',
                '世帯番号',
                '課税区分',
                '転入元都道府県市区町村コード',
                '異動事由コード',
                // '情報提供者機関コード' // 20240617_機関コードへの変換処理が不要となったためコメントアウト
            ];
            var columnIndices = requiredColumns.map(col => header.indexOf(col));
            // 足りないカラムをチェック
            var missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

            if (missingColumns.length > 0) {
                throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
            }

            // ①課税区分に値がある行除外 ②前住所コードの値による行除外 ③異動事由コードの値による行除外（一つのfunctionにまとめています）
            const filteredText = FilterTaxAndAddressAndMovementReason(columnIndices, header, rows);
            if (!filteredText) {
                logger.warn('■ファイル名：' + noTaxinfoFile + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                filteredTextFlg = true;
            }

            // 元STEP6 //
            requiredColumns = [
                '宛名番号',
                '住民票コード',
                '異動事由コード',
                '転入元都道府県市区町村コード' // 20240617_機関コードへの変換処理が不要となったため追加
                // '転入元都道府県市区町村コード' // 20240617_機関コードへの変換処理が不要となったためコメントアウト
            ];
            // カラムのインデックスを取得
            columnIndices = requiredColumns.map(col => header.indexOf(col));
            // 足りないカラムをチェック
            missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

            if (missingColumns.length > 0) {
                throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
            }

            const filterPreviousPrefectCodeText = filterPreviousPrefectCode(columnIndices, rows);
            if (!filterPreviousPrefectCodeText) {
                logger.warn('■ファイル名：' + RESIDENTINFO_INQUIRY_FILE_1 + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                filterPreviousPrefectCodeTextFlg = true;
            }

            // 元STEP7 //
            requiredColumns = [
                // 以下、ファイル作成用に必要なカラム
                '宛名番号',
                '世帯番号',
                'カナ氏名',
                '漢字氏名',
                '生年月日',
                '性別',
                '異動日',
                '届出日',
                '異動事由コード', //このカラムは、抽出判定時にもファイル作成時にも使用する
                '住民日',
                '住民届出日',
                '住民事由コード',
                '現住所住定日',
                '現住所届出日',
                '消除日',
                '消除届出日',
                '消除事由コード',
                // 以下、除外の判定のために必要なカラム（99999であれば除外する用）
                '転入元都道府県市区町村コード'
            ];
            // カラムのインデックスを取得
            columnIndices = requiredColumns.map(col => header.indexOf(col));
            // 足りないカラムをチェック
            missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

            if (missingColumns.length > 0) {
                throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
            }

            // todo 警告文、ヘッダーのみ出力の場合にも出すように改修する
            const filterNaturalizedCitizenText = filterChangeReasonCode(columnIndices, rows);
            if (!filterNaturalizedCitizenText) {
                logger.warn('■ファイル名：' + NATURALIZED_CITIZEN_FILE + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                filterNaturalizedCitizenTextFlg = true;
            }

            // 各ファイルをダウンロード            
            if (filteredTextFlg) {
                downloadCSV(filteredText, noTaxinfoFile, true);
            }
            if (filterPreviousPrefectCodeTextFlg) {
                downloadCSV(filterPreviousPrefectCodeText, RESIDENTINFO_INQUIRY_FILE_1);
            }
            if (filterNaturalizedCitizenTextFlg) {
                downloadCSV(filterNaturalizedCitizenText, NATURALIZED_CITIZEN_FILE);
            }
        } catch (error) {
            // catchしたエラーを表示
            logger.error(error);
        } finally {
            logger.info('STEP 5 処理を終了しました');
            //hideLoading();
        }
    };
    // onloadイベントを発火
    reader.readAsText(files[0]);

    /**
     * ①課税区分に値がある行除外 ②前住所コードの値による行除外 ③異動事由コードの値による行除外処理
     */
    function FilterTaxAndAddressAndMovementReason(columnIndices, header, rows) {
        const validCodes = ['A51', 'A52', 'A61', 'A62', 'BE1', 'BE2', 'BF1', 'BF2'];

        // 条件に合致するレコードのみをフィルタ
        const filteredLines = rows.filter(line => {
            const [taxClassification, previousAddressCode, changeReasonCode] = [
                line[columnIndices[2]],
                line[columnIndices[3]],
                line[columnIndices[4]]
            ];
            return (taxClassification == '' && previousAddressCode !== '99999' && !validCodes.includes(changeReasonCode));
        });
        // generateFixedLengthFileにテキストを渡し、中間サーバに連携する向けにファイル形式を整える
        // 口座照会用ファイルと仕様は同じだが「事務手続きコード」「情報提供者機関コード」「特定個人情報名コード」が異なるため、引数で値を渡す
        return generateFixedLengthFile([header.join(','), ...filteredLines.map(line => line.join(','))].join('\r\n'), 'JT01010000000214', 'TM00000000000002');
    }

    /**
    *  転入元都道府県市区町村コードが「99999」かつ異動事由コードがA51,A52,A61,A62,BE1,BE2,BF1,BF2のいずれでもない住民を抽出し、ファイル形式を整える 
    */
    function filterPreviousPrefectCode(columnIndices, rows) {
        // ヘッダーとレコード行に分割
        const validCodes = ['A51', 'A52', 'A61', 'A62', 'BE1', 'BE2', 'BF1', 'BF2'];

        // 条件に合致するレコードのみをフィルタする
        const filteredLines = rows.filter(line => {
            const [changeReasonCode, previousAddressCode] = [
                line[columnIndices[2]],
                line[columnIndices[3]]
            ];
            return (!validCodes.includes(changeReasonCode) && previousAddressCode == '99999');
        });

        // フィルタリングされた行から、宛名番号列と住民票コード列のみを抽出する
        const selectedLines = filteredLines.map(line => [
            line[columnIndices[0]],  // 宛名番号列
            line[columnIndices[1]]   // 住民票コード列
        ]);

        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return [['宛名番号', '住民票コード'].join(','), ...selectedLines.map(line => line.join(','))].join('\r\n') + '\r\n';
    }

    /**
    * 転入元都道府県市区町村コードが「99999」ではないかつ異動事由コードがA51,A52,A61,A62,BE1,BE2,BF1,BF2のいずれかの住民を抽出し、ファイル形式を整える
    */
    function filterChangeReasonCode(columnIndices, rows) {
        const validCodes = ['A51', 'A52', 'A61', 'A62', 'BE1', 'BE2', 'BF1', 'BF2'];
        // 出力用のヘッダーを定義する
        const outputHeader = [
            '宛名番号',
            '世帯番号',
            'カナ氏名',
            '漢字氏名',
            '生年月日',
            '性別',
            '異動日',
            '届出日',
            '異動事由コード',
            '住民日',
            '住民届出日',
            '住民事由コード',
            '現住所住定日',
            '現住所届出日',
            '消除日',
            '消除届出日',
            '消除事由コード',
        ];

        // 条件に合致する行を抽出する
        const filteredLines = rows.filter(line => {
            const [changeReasonCode, previousAddressCode] = [
                line[columnIndices[8]],
                line[columnIndices[17]]
            ];
            return (validCodes.includes(changeReasonCode) && previousAddressCode !== '99999');
        });

        // フィルタリングされた行から、必要なカラムのデータのみを抽出する
        const selectedLines = filteredLines.map(line => [
            line[columnIndices[0]],
            line[columnIndices[1]],
            line[columnIndices[2]],
            line[columnIndices[3]],
            line[columnIndices[4]],
            line[columnIndices[5]],
            line[columnIndices[6]],
            line[columnIndices[7]],
            line[columnIndices[8]],
            line[columnIndices[9]],
            line[columnIndices[10]],
            line[columnIndices[11]],
            line[columnIndices[12]],
            line[columnIndices[13]],
            line[columnIndices[14]],
            line[columnIndices[15]],
            line[columnIndices[16]]
        ]);
        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return [outputHeader.join(','), ...selectedLines.map(line => line.join(','))].join('\r\n') + '\r\n';
    }
}

// 中間サーバ照会用のファイルを作成する処理（他ステップでも使用する予定のため、Globalのfunctionとして作成した）
function generateFixedLengthFile(text, procedureCode, personalInfoCode, variableAndFixedSwitch = false) {
    const lines = parseCSV(text);
    const headers = lines.header;
    const toolUseTime = getCurrentTime().replace(/[:.\-\s]/g, '').trim();

    // アウトプット用のカラムを個別に定義する。プロパティでカラム長、該当する項目、埋め値、固定値（あれば）を定義
    const column1 = { length: 2, name: '番号体系', padding: '0', value: '01' };
    const column2 = { length: 15, name: '宛名番号', padding: '0' };
    const column3 = { length: 15, name: '統合宛名番号', padding: '' };
    const column4 = { length: 17, name: '照会依頼日時', value: toolUseTime };
    const column5 = { length: 20, name: '情報照会者部署コード', padding: ' ', padDirection: 'right', value: '3595115400' };
    const column6 = { length: 20, name: '情報照会者ユーザーID', padding: '' };
    const column7 = { length: 16, name: '情報照会者機関コード', padding: '0', value: '0220113112101700' };
    const column8 = { length: 1, name: '照会側不開示コード', padding: '0', value: '1' };
    const column9 = { length: 16, name: '事務コード', padding: '0', value: 'JM01000000121000' };
    const column10 = { length: 16, name: '事務手続きコード', padding: '0', value: procedureCode };
    const column11 = { length: 16, name: '情報照会者機関コード（委任元）', padding: '' };
    const column12 = { length: 16, name: '情報提供者機関コード（委任元）', padding: '' };
    // column13は税情報照会用ファイル作成の場合前住所コード（可変）を入力、公金口座照会用ファイル作成の場合「1419900000002200（固定）」を入力するため、デフォルト引数で切り替える
    const column13 = variableAndFixedSwitch ? { length: 16, name: '転入元都道府県市区町村コード', padding: ' ', padDirection: 'right', value: '1419900000002200' } :
        { length: 16, name: '転入元都道府県市区町村コード', padding: ' ', padDirection: 'right' };
    const column14 = { length: 16, name: '特定個人情報名コード', padding: '0', value: personalInfoCode };
    const column15 = { length: 1, name: '照会条件区分', padding: '0', value: '0' };
    const column16 = { length: 1, name: '照会年度区分', padding: '0', value: '0' };
    const column17 = { length: 8, name: '照会開始日付', padding: '' };
    const column18 = { length: 8, name: '照会終了日付', padding: '' };

    // 全カラムを配列にまとめる
    const columnDefinitions = [column1, column2, column3, column4, column5, column6, column7, column8, column9,
        column10, column11, column12, column13, column14, column15, column16, column17, column18];

    return lines.rows.map(line => {
        return columnDefinitions.map(colDef => {
            // 転入元都道府県市区町村コードの場合、政令指定都市対応を行う
            if (colDef.name === '転入元都道府県市区町村コード') {
                line[headers.indexOf(colDef.name)] = convertCityCode(line[headers.indexOf(colDef.name)]);
            }
            const value = colDef.value || line[headers.indexOf(colDef.name)] || '';
            if (colDef.padDirection === 'left') {
                // 左側をパディング
                return value.padStart(colDef.length, colDef.padding).substring(0, colDef.length);
            } else if (colDef.padDirection === 'right') {
                // 右側をパディング
                return value.padEnd(colDef.length, colDef.padding).substring(0, colDef.length);
            } else {
                // デフォルトは左側をパディング
                return value.padStart(colDef.length, colDef.padding).substring(0, colDef.length);
            }
        }).join(',');
    }).join('\r\n');
    // downloadCSVにて最終行の改行を付与するため、ここでは最終行の改行（ + '\r\n'）を付与しない
}

/* 6. 住基照会用ファイル①を出力する処理 */
/* 前住所地の住所コードが「99999」である住民を抽出し、「宛名番号,住民票コード」の構成に整形する */
// function generatePreviousAddressForeignFile() {
//     const fileIds = ['file13'];
//     const { check, file_num, files } = fileCheck(fileIds);
//     if (!check) {
//         return; // ファイル数が足りない場合は処理を終了
//     }

//     // 処理開始log
//     logger.info('STEP 6 処理を開始しました');

//     // 読み込んだデータをresults配列の対応する位置に保存する
//     const reader = new FileReader();
//     reader.onload = function (e) {
//         try {
//             // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
//             let text = e.target.result;

//             // 必要なヘッダーがあるかチェック
//             const { header, rows } = parseCSV(text);
//             const requiredColumns = [
//                 '宛名番号',
//                 '住民票コード',
//                 '異動事由コード',
//                 '転入元都道府県市区町村コード' // 20240617_機関コードへの変換処理が不要となったため追加
//                 // '転入元都道府県市区町村コード' // 20240617_機関コードへの変換処理が不要となったためコメントアウト
//             ];
//             // カラムのインデックスを取得
//             const columnIndices = requiredColumns.map(col => header.indexOf(col));
//             // 足りないカラムをチェック
//             const missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

//             if (missingColumns.length > 0) {
//                 throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
//             }

//             const filterPreviousPrefectCodeText = filterPreviousPrefectCode(columnIndices, rows);
//             if (!filterPreviousPrefectCodeText) {
//                 logger.warn("出力対象レコードが存在しませんでした。");
//             } else {
//                 downloadCSV(filterPreviousPrefectCodeText, RESIDENTINFO_INQUIRY_FILE_1);
//             }
//         } catch (error) {
//             // catchしたエラーを表示
//             logger.error(error);
//         } finally {
//             logger.info('STEP 6 処理を終了しました');
//         }
//     };
//     // onloadイベントを発火
//     reader.readAsText(files[0]);

//     /* 転入元都道府県市区町村コードが「99999」かつ異動事由コードがA51,A52,A61,A62,BE1,BE2,BF1,BF2のいずれでもない住民を抽出し、ファイル形式を整える */
//     function filterPreviousPrefectCode(columnIndices, rows) {
//         // ヘッダーとレコード行に分割
//         const validCodes = ['A51', 'A52', 'A61', 'A62', 'BE1', 'BE2', 'BF1', 'BF2'];

//         // 条件に合致するレコードのみをフィルタする
//         const filteredLines = rows.filter(line => {
//             const [changeReasonCode, previousAddressCode] = [
//                 line[columnIndices[2]],
//                 line[columnIndices[3]]
//             ];
//             return (!validCodes.includes(changeReasonCode) && previousAddressCode == '99999');
//         });

//         // フィルタリングされた行から、宛名番号列と住民票コード列のみを抽出する
//         const selectedLines = filteredLines.map(line => [
//             line[columnIndices[0]],  // 宛名番号列
//             line[columnIndices[1]]   // 住民票コード列
//         ]);

//         // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
//         return [['宛名番号', '住民票コード'].join(','), ...selectedLines.map(line => line.join(','))].join('\r\n') + '\r\n';
//     }
// }

/* 7. 帰化対象者をファイルを出力する処理 */
// function generateNaturalizedCitizenFile() {
//     // 各ファイルのIDを配列に格納する
//     const fileIds = ['file14'];
//     // 各ファイルのIDを配列に格納する
//     const { check, file_num, files } = fileCheck(fileIds);
//     if (!check) {
//         return; // ファイル数が足りない場合は処理を終了
//     }

//     // 処理開始log
//     logger.info('STEP 7 処理を開始しました');

//     // 読み込んだデータをresults配列の対応する位置に保存する
//     const reader = new FileReader();
//     reader.onload = function (e) {
//         try {
//             // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
//             let text = e.target.result;

//             // 必要なヘッダーがあるかチェック
//             const { header, rows } = parseCSV(text);
//             const requiredColumns = [
//                 // 以下、ファイル作成用に必要なカラム
//                 '宛名番号',
//                 '世帯番号',
//                 'カナ氏名',
//                 '漢字氏名',
//                 '生年月日',
//                 '性別',
//                 '届出日',
//                 '異動日',
//                 '異動事由コード', //このカラムは、抽出判定時にもファイル作成時にも使用する
//                 '住民日',
//                 '住民届出日',
//                 '住民事由コード',
//                 '現住所住定日',
//                 '現住所届出日',
//                 '消除日',
//                 '消除届出日',
//                 '消除事由コード',
//                 // 以下、除外の判定のために必要なカラム（99999であれば除外する用）
//                 '転入元都道府県市区町村コード'
//             ];
//             // カラムのインデックスを取得
//             const columnIndices = requiredColumns.map(col => header.indexOf(col));
//             // 足りないカラムをチェック
//             const missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

//             if (missingColumns.length > 0) {
//                 throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
//             }

//             const filterNaturalizedCitizenText = filterChangeReasonCode(columnIndices, rows);
//             if (!filterNaturalizedCitizenText) {
//                 logger.warn("出力対象レコードが存在しませんでした。");
//             } else {
//                 downloadCSV(filterNaturalizedCitizenText, NATURALIZED_CITIZEN_FILE);
//             }
//         } catch (error) {
//             // catchしたエラーを表示
//             logger.error(error);
//         } finally {
//             logger.info('STEP 7 処理を終了しました');
//         }
//     };
//     // onloadイベントを発火
//     reader.readAsText(files[0]);

//     /* 転入元都道府県市区町村コードが「99999」ではないかつ異動事由コードがA51,A52,A61,A62,BE1,BE2,BF1,BF2のいずれかの住民を抽出し、ファイル形式を整える */
//     function filterChangeReasonCode(columnIndices, rows) {
//         const validCodes = ['A51', 'A52', 'A61', 'A62', 'BE1', 'BE2', 'BF1', 'BF2'];
//         // 出力用のヘッダーを定義する
//         const outputHeader = [
//             '宛名番号',
//             '世帯番号',
//             'カナ氏名',
//             '漢字氏名',
//             '生年月日',
//             '性別',
//             '届出日',
//             '異動日',
//             '異動事由コード',
//             '住民日',
//             '住民届出日',
//             '住民事由コード',
//             '現住所住定日',
//             '現住所届出日',
//             '消除日',
//             '消除届出日',
//             '消除事由コード',
//         ];

//         // 条件に合致する行を抽出する
//         const filteredLines = rows.filter(line => {
//             const [changeReasonCode, previousAddressCode] = [
//                 line[columnIndices[8]],
//                 line[columnIndices[17]]
//             ];
//             return (validCodes.includes(changeReasonCode) && previousAddressCode !== '99999');
//         });

//         // フィルタリングされた行から、必要なカラムのデータのみを抽出する
//         const selectedLines = filteredLines.map(line => [
//             line[columnIndices[0]],
//             line[columnIndices[1]],
//             line[columnIndices[2]],
//             line[columnIndices[3]],
//             line[columnIndices[4]],
//             line[columnIndices[5]],
//             line[columnIndices[6]],
//             line[columnIndices[7]],
//             line[columnIndices[8]],
//             line[columnIndices[9]],
//             line[columnIndices[10]],
//             line[columnIndices[11]],
//             line[columnIndices[12]],
//             line[columnIndices[13]],
//             line[columnIndices[14]],
//             line[columnIndices[15]],
//             line[columnIndices[16]]
//         ]);
//         // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
//         return [outputHeader.join(','), ...selectedLines.map(line => line.join(','))].join('\r\n') + '\r\n';
//     }
// }

/* 6.税情報無しの住民を含んだファイルに対し、番号連携照会結果（税情報）ファイルの値によって課税/非課税/均等割の更新をかける処理 */
function updateTaxInfoByInquiryResult() {
    const fileIds = ['file15', 'file16'];
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files, true);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」もしくは「.DAT」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル④」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル④')) {
        alert('アップロードするファイル名を「中間ファイル④」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル④」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 6 処理を開始しました');

    // map処理でファイル分のFileReaderオブジェクトを生成し、ファイルの読み込みを行う
    const readers = files.map(file => new FileReader());
    const results = [];

    // 各ファイルを順に読み込み、読み込みが完了したタイミングでonload処理が走る（onloadイベント）
    readers.forEach((reader, index) => {
        reader.onload = function (e) {
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う
            if (results.filter(result => result).length === file_num) {
                try {
                    const updateTaxInfo = updateTaxInfoByNonHeaderFile(results[0], results[1]);
                    downloadCSV(updateTaxInfo, MIDDLE_FILE_5);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 6 処理を終了しました');
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function updateTaxInfoByNonHeaderFile(csvText1, csvText2) {
        // 税情報照会ファイルがヘッダー無しファイルのため、ファイル一行目に追加する用のヘッダーを定義する
        let column = new Array(279).fill('')

        // カラムが最初空文字列で初期化されているため、1から始まるようにする
        for (let i = 0; i < column.length; i++) {
            column[i] = i + 1;
        }

        // 後続処理で使用するカラム名は連番とは別で定義する
        column[1] = '宛名番号';
        column[247] = '市町村民税均等割額';
        column[271] = '市町村民税所得割額（定額減税前）';

        // ヘッダー配列を「,」で区切って税情報照会ファイルの先頭に追加する
        csvText2 = column.join(',') + '\r\n' + csvText2;

        // CSVテキストを行ごとに分割して配列に変換
        const arrayFromMidFile = parseCSV(csvText1);
        const arrayFromInquiryResult = parseCSV(csvText2);

        // ヘッダー行を取得
        const midFileHeader = arrayFromMidFile.header;
        const inquiryResultHeader = arrayFromInquiryResult.header;

        // 中間ファイル④の必要カラムindexを指定する
        const addressNumIndex1 = midFileHeader.indexOf('宛名番号');
        const taxClassIndex = midFileHeader.indexOf('課税区分');
        // 税情報照会結果ファイルの必要カラムindexを指定する
        const addressNumIndex2 = inquiryResultHeader.indexOf('宛名番号');
        const equalBracketIndex = inquiryResultHeader.indexOf('市町村民税均等割額');
        const incomePercentageIndex = inquiryResultHeader.indexOf('市町村民税所得割額（定額減税前）');

        // エラーハンドリング（必要なカラムが存在しない場合、ファイル名とカラムを表示する）
        const missingColumns = [];
        if (addressNumIndex1 === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：宛名番号');
        }
        if (taxClassIndex === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：課税区分');
        }
        if (addressNumIndex2 === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：宛名番号（項番2）');
        }
        if (equalBracketIndex === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：市町村民税均等割額（項番248）');
        }
        if (incomePercentageIndex === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：市町村民税所得割額（定額減税前）（項番272）');
        }

        if (missingColumns.length > 0) {
            throw new Error('以下のカラムが見つかりません。ファイルの確認をお願いします。\n' + missingColumns.join('\n'));
        }

        // エラーハンドリング用：中間ファイルの宛名番号をセットにする
        const midFileAddressNumSet = new Set(arrayFromMidFile.rows.map(row => row[addressNumIndex1]));
        // エラー対象（中間ファイルに存在せず、税情報照会結果ファイルに存在する宛名番号）のリストを定義する
        const errorAddressNums = [];

        // 税情報照会結果ファイルの宛名番号をキーにして、均等割額・所得割額をマップにする
        const taxMap = {};
        arrayFromInquiryResult.rows.forEach(inquiryRow => {
            const addressNumFromResultFile = inquiryRow[addressNumIndex2];
            const equalBracket = inquiryRow[equalBracketIndex];
            const incomePercentage = inquiryRow[incomePercentageIndex];

            // 中間ファイルに存在しない宛名番号がある場合、エラー対象リストに追加する
            if (!midFileAddressNumSet.has(addressNumFromResultFile)) {
                errorAddressNums.push(addressNumFromResultFile);
            }

            taxMap[addressNumFromResultFile] = [equalBracket, incomePercentage]; // 均等割額と所得割額をセットにしてマップに格納する
        });

        // エラー対象の宛名番号が存在する場合、エラーを出力し処理を中断する
        if (errorAddressNums.length > 0) {
            throw new Error('以下の宛名番号が中間ファイル④に存在せず、税情報照会結果ファイルに存在しています。\n' + errorAddressNums.join(', ') + '\nインプットファイルを確認してください。');
        }

        // 中間ファイル④にて、宛名番号に対応する課税区分を更新する
        arrayFromMidFile.rows.forEach(midRow => {
            const addressNumFromMidFile = midRow[addressNumIndex1];
            if (taxMap.hasOwnProperty(addressNumFromMidFile)) {
                const equalBracket = taxMap[addressNumFromMidFile][0];
                const incomePercentage = taxMap[addressNumFromMidFile][1];
                
                // 「所得割額」が0かつ、「均等割額」が0であるものを非課税(1)判定
                if (incomePercentage == 0 && equalBracket == 0) {
                    midRow[taxClassIndex] = '1';
                    // 「所得割額」が0かつ、「均等割額」が1以上であるものを均等割りのみ課税(2)判定
                } else if (incomePercentage == 0 && equalBracket > 0) {
                    midRow[taxClassIndex] = '2';
                    // 「所得割額」が1以上かつ、「均等割額」が1以上であるものを課税(3)判定
                } else if (incomePercentage > 0 && equalBracket > 0) {
                    midRow[taxClassIndex] = '3';
                    // 「所得割額」が1以上のときは「均等割額」が1以上になるはずのため、「均等割額」が0のものはエラーとして投げる
                } else if (incomePercentage > 0 && equalBracket == 0) {
                    throw new Error('【宛名番号：' + String(addressNumFromMidFile) + 'の課税情報】\n「所得割額」が1以上ですが「均等割額」が0となっております。インプットファイルを確認してください。')
                    // その他（照会エラーが想定されるもの）はStep8の出力ファイルを使用して再度照会をかけるため、この場では空を返す
                } else {
                    midRow[taxClassIndex] = '';
                }
            }
        });

        // フィルタリングされた行をCSV形式に戻す
        return [midFileHeader, ...arrayFromMidFile.rows].map(line => line.join(',')).join('\r\n') + '\r\n';
    }
}

/* 7.税情報無しの住民を含んだファイルに対し、帰化対象者税情報ファイルの値によって課税/非課税/均等割の更新をかける処理 */
function updateTaxInfoByNaturalizedCitizenFile() {
    const fileIds = ['file17', 'file18'];
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル⑤」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル⑤')) {
        alert('アップロードするファイル名を「中間ファイル⑤」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル⑤」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 7 処理を開始しました');

    // map処理でファイル分のFileReaderオブジェクトを生成し、ファイルの読み込みを行う
    const readers = files.map(file => new FileReader());
    const results = [];

    // 各ファイルを順に読み込み、読み込みが完了したタイミングでonload処理が走る（onloadイベント）
    readers.forEach((reader, index) => {
        reader.onload = function (e) {
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う
            if (results.filter(result => result).length === file_num) {
                try {
                    // 帰化対象者税情報ファイルの宛名番号をキーに、課税区分を更新する処理
                    const updateTaxInfo = updateTaxInfoByOldAdressNum(results[0], results[1]);
                    // 課税対象の住民を除外する処理
                    const excludeTaxableReferenceToInquiryResult = filterTaxExcluded(updateTaxInfo);
                    // CSVダウンロード処理
                    downloadCSV(excludeTaxableReferenceToInquiryResult, MIDDLE_FILE_6);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 7 処理を終了しました');
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function updateTaxInfoByOldAdressNum(csvText1, csvText2) {
        // CSVテキストを行ごとに分割して配列に変換
        const arrayFromMidFile = parseCSV(csvText1);
        const arrayFromNaturalizedCitizenFile = parseCSV(csvText2);

        // ヘッダー行を取得
        const midFileHeader = arrayFromMidFile.header;
        // 帰化対象者税情報照会結果ファイルに「ＦＯ－」が含まれるカラムが存在するため、取り除く処理を行う
        const naturalizedCitizenFileheader = removeStrFromHeader(arrayFromNaturalizedCitizenFile.header, "ＦＯ－");

        // 必要な列のインデックスを取得
        const addressNumIndex1 = midFileHeader.indexOf('宛名番号'); // 中間ファイル⑤の宛名番号のインデックスを取得
        const taxClassIndex = midFileHeader.indexOf('課税区分'); // 中間ファイル⑤の課税区分のインデックスを取得
        const addressNumIndex2 = naturalizedCitizenFileheader.indexOf('宛名番号'); // 帰化対象者税情報照会結果ファイルの宛名番号のインデックスを取得
        const taxClassIndex2 = naturalizedCitizenFileheader.indexOf('旧宛名番号の課税区分'); // 帰化対象者税情報照会結果ファイルの税区分のインデックスを取得

        // エラーハンドリング（必要なカラムが存在しない場合、ファイル名とカラムを表示する）
        const missingColumns = [];
        if (addressNumIndex1 === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：宛名番号');
        }
        if (taxClassIndex === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：課税区分');
        }
        if (addressNumIndex2 === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：宛名番号');
        }
        if (taxClassIndex2 === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：旧宛名番号の課税区分');
        }

        if (missingColumns.length > 0) {
            throw new Error('以下のカラムが見つかりません。ファイルの確認をお願いします。\n' + missingColumns.join('\n'));
        }

        // エラーハンドリング用：中間ファイルの宛名番号をセットにする
        const midFileAddressNumSet = new Set(arrayFromMidFile.rows.map(row => row[addressNumIndex1]));
        // エラー対象（中間ファイルに存在せず、帰化対象者税情報照会結果ファイルに存在する宛名番号）のリストを定義する
        const errorAddressNums = [];

        // 帰化対象者税情報照会結果ファイルの宛名番号をキーにして税区分をマップにする
        const taxMap = {};
        arrayFromNaturalizedCitizenFile.rows.forEach(inquiryrow => {
            const addressNumFromResultFile = inquiryrow[addressNumIndex2].padStart(10, '0'); // 帰化対象者の宛名番号を取得
            const taxClassFromResultFile = inquiryrow[taxClassIndex2]; // 帰化対象者の税区分を取得

            // 中間ファイルに存在しない宛名番号がある場合、エラー対象リストに追加する
            if (!midFileAddressNumSet.has(addressNumFromResultFile)) {
                errorAddressNums.push(addressNumFromResultFile);
            }

            taxMap[addressNumFromResultFile] = taxClassFromResultFile; // 宛名番号をキーにして税区分をマップに格納する
        });

        // エラー対象の宛名番号が存在する場合、エラーを出力し処理を中断する
        if (errorAddressNums.length > 0) {
            throw new Error('以下の宛名番号が中間ファイル⑤に存在せず、帰化対象者税情報照会結果ファイルに存在しています。\n' + errorAddressNums.join(', ') + '\nインプットファイルを確認してください。');
        }

        // 中間ファイル④にて、宛名番号に対応する課税区分を更新する
        arrayFromMidFile.rows.forEach(midRow => {
            // 中間ファイル⑤の宛名番号を取得する
            const addressNumFromMidFile = midRow[addressNumIndex1];
            if (taxMap.hasOwnProperty(addressNumFromMidFile)) {
                const taxClass = taxMap[addressNumFromMidFile];

                // 帰化対象者税情報照会ファイルの税区分が「非課税」である住民を非課税(1)判定として中間ファイル⑤更新
                if (taxClass === '非課税') {
                    midRow[taxClassIndex] = '1';
                }
                // 帰化対象者税情報照会ファイルの税区分が「均等割のみ課税」である住民を均等割のみ課税(2)判定として中間ファイル⑤更新
                else if (taxClass === '均等割りのみ課税') {
                    midRow[taxClassIndex] = '2';
                }
                // 帰化対象者税情報照会ファイルの税区分が「課税」である住民を均等割のみ課税(3)判定として中間ファイル⑤更新
                else if (taxClass === '課税') {
                    midRow[taxClassIndex] = '3';
                }
                // 帰化対象者税情報照会ファイルの税区分が「未申告」である住民を未申告(4)判定として中間ファイル⑤更新
                else if (taxClass === '未申告') {
                    midRow[taxClassIndex] = '4';
                }
                //税区分が返ってこなかった（2次照会にかける）住民は課税区分を空にする
                else {
                    midRow[taxClassIndex] = '';
                }
            }
        });

        // フィルタリングされた行をCSV形式に戻す
        return [midFileHeader, ...arrayFromMidFile.rows].map(line => line.join(',')).join('\r\n') + '\r\n';
    }
}

/* 8.①課税区分に値がないかつ前住所地の住所コードが「99999」ではない住民の口座照会用ファイル（DAT）②税情報無し住民ファイル（csv）を出力する処理 */
function generateInquiryFiles() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['file21'];
    // 出力ファイル名を定義する
    const publicAccountInquiryFile = "P640R110_" + getCurrentTime().replace(/[:.\-\s]/g, '').trim().slice(0, 14);
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル⑥」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル⑥')) {
        alert('アップロードするファイル名を「中間ファイル⑥」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル⑥」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 8 処理を開始しました');
    //showLoading();

    // 読み込んだデータをresults配列の対応する位置に保存する
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            // 全ての処理が完了したら、結果をダウンロードする
            let publicAccountInquiryFlg = false;
            let noTaxInfoFlg = false;

            // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
            let text = e.target.result;

            // 必要なヘッダーがあるかチェック
            const { header, rows } = parseCSV(text);
            const requiredColumns = [
                '宛名番号',
                '世帯番号',
                '課税区分',
                '転入元都道府県市区町村コード',
                '異動事由コード',
                '住民票コード'
            ];
            const columnIndices = requiredColumns.map(col => header.indexOf(col));
            // 足りないカラムをチェック
            const missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

            if (missingColumns.length > 0) {
                throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
            }

            /* 公金口座照会用ファイルの作成処理 */
            const publicAccountInquiryText = generatePublicAccountInquiryFile(columnIndices, header, rows);
            if (!publicAccountInquiryText) {
                logger.warn('■ファイル名：' + publicAccountInquiryFile + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                publicAccountInquiryFlg = true;
            }

            /* 住基照会用ファイルの作成処理 */
            const filterPreviousPrefectCodeText = filterPreviousPrefectCode(columnIndices, rows);
            if (!filterPreviousPrefectCodeText) {
                logger.warn('■ファイル名：' + RESIDENTINFO_INQUIRY_FILE_2 + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                noTaxInfoFlg = true;
            }

            // 各ファイルをダウンロード            
            if (publicAccountInquiryFlg) {
                downloadCSV(publicAccountInquiryText, publicAccountInquiryFile, true);
            }
            if (noTaxInfoFlg) {
                downloadCSV(filterPreviousPrefectCodeText, RESIDENTINFO_INQUIRY_FILE_2);
            }
        } catch (error) {
            // catchしたエラーを表示
            logger.error(error);
        } finally {
            logger.info('STEP 8 処理を終了しました');
            //hideLoading();
        }
    };
    // onloadイベントを発火
    reader.readAsText(files[0]);

    /**
     * 課税区分が空でない、もしくは「未申告（=4）でない行 または ②前住所コードが「99999」でない行を抽出し、ファイル形式を整える処理
     */
    function generatePublicAccountInquiryFile(columnIndices, header, rows) {
        // 条件に合致するレコードのみをフィルタする
        const filteredLines = rows.filter(line => {
            const [taxClassification, previousAddressCode] = [
                line[columnIndices[2]],
                line[columnIndices[3]]
            ];
            return taxClassification !== '' && taxClassification !== '4' && previousAddressCode !== '99999';
        });
        // generateFixedLengthFileにテキストを渡し、中間サーバに連携する向けにファイル形式を整える
        // 税情報照会用ファイルと仕様は同じだが「事務手続きコード」「情報提供者機関コード」「特定個人情報名コード」が異なるため、引数で値を渡す
        return generateFixedLengthFile([header.join(','), ...filteredLines.map(line => line.join(','))].join('\r\n'), 'JT01010000000001', 'TM00000000000089', true);
    }

    /**
    *  課税区分が空 かつ 前住所コードが「99999」でない行を抽出し、ファイル形式を整える
    */
    function filterPreviousPrefectCode(columnIndices, rows) {
        // 条件に合致するレコードのみをフィルタする
        const filteredLines = rows.filter(line => {
            const [taxClassification, previousAddressCode] = [
                line[columnIndices[2]],
                line[columnIndices[3]]
            ];
            // 
            return (taxClassification == '' && previousAddressCode !== '99999');
        });

        // フィルタリングされた行から、宛名番号列と住民票コード列のみを抽出する
        const selectedLines = filteredLines.map(line => [
            line[columnIndices[0]],  // 宛名番号列
            line[columnIndices[5]]   // 住民票コード列
        ]);

        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return [['宛名番号', '住民票コード'].join(','), ...selectedLines.map(line => line.join(','))].join('\r\n') + '\r\n';
    }
}

/* 以下、使いまわすメソッド（汎用処理）ここから */

/**
 * 必要なファイルがすべてアップロードされているかのチェック
 * @param {string[]} fileIds 入力ファイル名の1次元配列
 * @returns {{ check: boolean, file_num: number, files: object }} チェック結果のオブジェクト
 * @property {boolean} check - チェック結果
 * @property {number} file_num - 理論ファイル数
 * @property {object} files - ファイルオブジェクト
 */
function fileCheck(fileIds) {
    let check = false;
    // 読み込むファイル数
    const file_num = fileIds.length;
    // document.getElementById()メソッド：HTMLのIDタグにマッチするドキュメントを取得する
    const files = fileIds.map(id => document.getElementById(id).files[0]);

    // ファイル数のチェック
    if (files.some(file => !file)) {
        alert("すべて( " + file_num + "個 )のファイルをアップロードしてください。");
    }
    else {
        check = true;
    }
    return { check, file_num, files };
}

/**
 * アップロードされたファイルがCSV形式かを確認する処理
 * @param {string[]} files ファイル名チェックを受けるファイルの配列
 * @param {boolean} allowDat ファイルの拡張子が.datを許可するかどうか
 * @returns {boolean} チェック結果
 */
function fileExtensionCheck(files, allowDat = false) {
    // 拡張子が.csvまたは.datでないファイルを格納する配列
    const errorFileNames = [];

    // 各ファイルの拡張子をチェック
    files.forEach(file => {
        if (!file.name.endsWith('.csv') && !(allowDat && file.name.endsWith('.DAT'))) {
            errorFileNames.push(file.name);
        }
    });

    // エラーとして拡張子が「.csv」または「.dat」でないファイル名を表示する
    if (errorFileNames.length > 0) {
        let datMessage = allowDat ? ['または「.DAT」', 'またはDATファイル'] : ['', ''];
        alert('以下のファイルの拡張子が「.csv」' + datMessage[0] + 'ではありません。\n' + errorFileNames.join('\n') + '\nアップロードするファイルはCSVファイル' + datMessage[1] + 'を使用して下さい。');
        return false;
    }

    return true;
}

/**
 * 課税対象の住民を除外する関数
 * @param {string} text csvファイルのデータを文字列化して入力
 * @return {string} 課税対象の住民を含む世帯の行を除外したデータを文字列化して出力
 */
function filterTaxExcluded(text) {
    const lines = parseCSV(text)
    const taxClassification = lines.header.indexOf('課税区分');
    const householdNumIndex = lines.header.indexOf('世帯番号');

    if (taxClassification === -1) {
        throw ('課税区分列が見つかりません。');
    }

    if (householdNumIndex === -1) {
        throw ('世帯番号列が見つかりません。');
    }

    // 除外対象の世帯番号の値を収集するためのセットを作成する
    const excludedHouseholdNumSet = new Set();

    // 課税区分が「3」の行の「世帯番号」カラムの値を取得する
    lines.rows.forEach((line) => {
        if (line[taxClassification] === '3') {
            // 「世帯番号」の値をセットに追加する
            excludedHouseholdNumSet.add(line[householdNumIndex]);
        }
    });

    // 収集した世帯番号に属する行を除外する
    const filteredLines = lines.rows.filter((line) => {
        return !excludedHouseholdNumSet.has(line[householdNumIndex]);
    });

    // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
    return [lines.header.join(','), ...filteredLines.map(line => line.join(','))].join('\r\n') + '\r\n';
}

/**
 * CSVファイルのダウンロード処理
 * @param {string} content csvファイルのデータを文字列化して入力
 * @param {string} filename 出力するファイルのファイル名
 * @param {boolean} splitRows 出力ファイルを行数で分割するかどうか（デフォルト値はfalse）
 */

function downloadCSV(content, filename, splitRows = false) {
    // 第三引数がtrueの場合、データを分割してダウンロードする
    if (splitRows) {
        // データを行ごとに分割する
        const rows = content.split('\r\n');
        // データを分割する数を指定する
        for (let i = 0; i < rows.length; i += NUMBER_OF_DATA_DIVISION) {
            const division = rows.slice(i, i + NUMBER_OF_DATA_DIVISION).join('\r\n') + '\r\n';
            const divisionFilename = filename + "_" + ((i / NUMBER_OF_DATA_DIVISION + 1).toString().padStart(4, '0')) + ".DAT";
            const blob = new Blob([division], { type: 'text/csv' });
            downloadBlob(blob, divisionFilename);
        }
    } else {
        const blob = new Blob([content], { type: 'text/csv' });
        downloadBlob(blob, filename);
    }

    function downloadBlob(blob, fileName) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        document.getElementById('btn_audio').play();
    }
}

/**
 * ヘッダーの文字から前方一致で任意の文字列を削除する
 * @param {array} header 1次元配列形式でヘッダーを入力
 * @param {string} deleteStr 削除する文字列
 */
function removeStrFromHeader(header, deleteStr) {
    const delRegex = new RegExp("^" + deleteStr);
    return header.map(col => col.replace(delRegex, ''));
}

/**
 * 各CSV（DAT）ファイルをヘッダーとデータ行に分解し、1行ずつ配列に格納する
 * @param {String} text FileReaderが読み込んだファイル文字列（e.target.result）
 */
function parseCSV(text) {
    const [header, ...rows] = text
        .split('\r\n')                // split()メソッドを使用して、CSVファイルの行を'\r\n'（改行）単位で分解
        .map(line => line.trim())   // 各行の前後に空白文字がある場合削除
        .filter(line => line)       // 空行がある場合削除
        .map(line => {
            return line.split(',').map(field => {           // 各行をカンマ , で分割してフィールドに分ける
                return field.replace(/^"|"$/g, '').trim();  //各フィールドの前後に引用符（"）がある場合削除し、前後の空白も削除
            });
        });
    // CSVファイルをヘッダー・各行で分けてobjectとして返す
    return { header: header, rows: rows.map(row => row) };
}

/**
 * 現在時刻を取得する
 * @return {String} YYYY-MM-dd HH:mm:ss.sss
 */
function getCurrentTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/* 使いまわすメソッド（汎用処理）ここまで */

// ログ出力クラス
class Logger {
    constructor(level = 'info', logContainerId = 'log-box') {
        this.levels = ['debug', 'info', 'warn', 'error'];
        this.level = level;
        this.logContainer = document.getElementById(logContainerId);
    }

    // ログレベル・時刻・メッセージを結合
    log(level, message) {
        if (this.levels.indexOf(level) >= this.levels.indexOf(this.level)) {
            const timestamp = getCurrentTime();
            const logMessage = `[${timestamp}] [${level.toUpperCase()}] \n${message}`;
            this.appendLog(logMessage, level);
        }
    }

    // 作成したログをHTML上にセットする
    appendLog(message, level) {
        const logEntry = document.createElement('div');
        logEntry.textContent = message;
        logEntry.classList.add(`log-${level}`);
        this.logContainer.appendChild(logEntry);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    debug(message) {
        this.log('debug', message);
    }

    info(message) {
        this.log('info', message);
    }

    warn(message) {
        this.log('warn', message);
    }

    error(message) {
        this.log('error', message);
    }
}

// ログ出力クラスのインスタンス化
var logger = new Logger(LOG_LEVEL); // 引数以上のレベルのログのみを出力します（infoの場合、debugログは出力されない）

/**
 * ロード中のグルグルを表示
 */
function showLoading() {
    //document.getElementById('load_circle').style.display = "block";
}
/**
 * ロード中のグルグルを非表示
 */
function hideLoading() {
    //document.getElementById('load_circle').style.display = "none";
}

/**
 * 政令指定都市のコードを変換する
 * @param {string} cityCode 政令指定都市のコード
 * @returns {string} 変換後のコード
 */
function convertCityCode(cityCode) {
    // 政令指定都市のコードを変換する
    const cityCodeMap = {
        "01101": "01100",
        "01102": "01100",
        "01103": "01100",
        "01104": "01100",
        "01105": "01100",
        "01106": "01100",
        "01107": "01100",
        "01108": "01100",
        "01109": "01100",
        "01110": "01100",
        "04101": "04100",
        "04102": "04100",
        "04103": "04100",
        "04104": "04100",
        "04105": "04100",
        "11101": "11100",
        "11102": "11100",
        "11103": "11100",
        "11104": "11100",
        "11105": "11100",
        "11106": "11100",
        "11107": "11100",
        "11108": "11100",
        "11109": "11100",
        "11110": "11100",
        "12101": "12100",
        "12102": "12100",
        "12103": "12100",
        "12104": "12100",
        "12105": "12100",
        "12106": "12100",
        "14101": "14100",
        "14102": "14100",
        "14103": "14100",
        "14104": "14100",
        "14105": "14100",
        "14106": "14100",
        "14107": "14100",
        "14108": "14100",
        "14109": "14100",
        "14110": "14100",
        "14111": "14100",
        "14112": "14100",
        "14113": "14100",
        "14114": "14100",
        "14115": "14100",
        "14116": "14100",
        "14117": "14100",
        "14118": "14100",
        "14131": "14130",
        "14132": "14130",
        "14133": "14130",
        "14134": "14130",
        "14135": "14130",
        "14136": "14130",
        "14137": "14130",
        "14151": "14150",
        "14152": "14150",
        "14153": "14150",
        "14209": "14150",
        "15101": "15100",
        "15102": "15100",
        "15103": "15100",
        "15104": "15100",
        "15105": "15100",
        "15106": "15100",
        "15107": "15100",
        "15108": "15100",
        "15201": "15100",
        "22101": "22100",
        "22102": "22100",
        "22103": "22100",
        "22201": "22100",
        "22131": "22130",
        "22132": "22130",
        "22133": "22130",
        "22134": "22130",
        "22135": "22130",
        "22136": "22130",
        "22137": "22130",
        "22138": "22130",
        "22139": "22130",
        "22140": "22130",
        "22202": "22130",
        "23101": "23100",
        "23102": "23100",
        "23103": "23100",
        "23104": "23100",
        "23105": "23100",
        "23106": "23100",
        "23107": "23100",
        "23108": "23100",
        "23109": "23100",
        "23110": "23100",
        "23111": "23100",
        "23112": "23100",
        "23113": "23100",
        "23114": "23100",
        "23115": "23100",
        "23116": "23100",
        "26101": "26100",
        "26102": "26100",
        "26103": "26100",
        "26104": "26100",
        "26105": "26100",
        "26106": "26100",
        "26107": "26100",
        "26108": "26100",
        "26109": "26100",
        "26110": "26100",
        "26111": "26100",
        "27101": "27100",
        "27102": "27100",
        "27103": "27100",
        "27104": "27100",
        "27106": "27100",
        "27107": "27100",
        "27108": "27100",
        "27109": "27100",
        "27111": "27100",
        "27113": "27100",
        "27114": "27100",
        "27115": "27100",
        "27116": "27100",
        "27117": "27100",
        "27118": "27100",
        "27119": "27100",
        "27120": "27100",
        "27121": "27100",
        "27122": "27100",
        "27123": "27100",
        "27124": "27100",
        "27125": "27100",
        "27126": "27100",
        "27127": "27100",
        "27128": "27100",
        "27141": "27140",
        "27142": "27140",
        "27143": "27140",
        "27144": "27140",
        "27145": "27140",
        "27146": "27140",
        "27147": "27140",
        "27201": "27140",
        "28101": "28100",
        "28102": "28100",
        "28105": "28100",
        "28106": "28100",
        "28107": "28100",
        "28108": "28100",
        "28109": "28100",
        "28110": "28100",
        "28111": "28100",
        "33101": "33100",
        "33102": "33100",
        "33103": "33100",
        "33104": "33100",
        "33201": "33100",
        "34101": "34100",
        "34102": "34100",
        "34103": "34100",
        "34104": "34100",
        "34105": "34100",
        "34106": "34100",
        "34107": "34100",
        "34108": "34100",
        "40101": "40100",
        "40103": "40100",
        "40105": "40100",
        "40106": "40100",
        "40107": "40100",
        "40108": "40100",
        "40109": "40100",
        "40131": "40130",
        "40132": "40130",
        "40133": "40130",
        "40134": "40130",
        "40135": "40130",
        "40136": "40130",
        "40137": "40130",
        "43101": "43100",
        "43102": "43100",
        "43103": "43100",
        "43104": "43100",
        "43105": "43100",
        "43201": "43100",
    }

    return cityCodeMap[cityCode] || cityCode;
}