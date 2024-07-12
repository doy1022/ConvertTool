/* 定数定義 */
const LOG_LEVEL = 'debug'; // Log出力のレベルを選択（debug, info, warn, error）
const MIDDLE_FILE_0 = "中間ファイル⓪.csv";
const MIDDLE_FILE_1 = "中間ファイル①.csv";
const MIDDLE_FILE_2 = "中間ファイル②.csv";
const MIDDLE_FILE_3 = "中間ファイル③.csv";
const MIDDLE_FILE_4 = "中間ファイル④.csv";
const MIDDLE_FILE_5 = "中間ファイル⑤.csv";
const MIDDLE_FILE_6 = "中間ファイル⑥.csv";
const MIDDLE_FILE_6_ADDITIONAL_EXCLUSION = "中間ファイル⑥-追加対応済み.csv";
const MIDDLE_FILE_7 = "中間ファイル⑦.csv";
const MIDDLE_FILE_8 = "中間ファイル⑧.csv";
const MIDDLE_FILE_9 = "中間ファイル⑨.csv";
const MIDDLE_FILE_10 = "中間ファイル⑩.csv";
const RESIDENTINFO_INQUIRY_FILE_1 = "住基照会用ファイル①.csv";
const RESIDENTINFO_INQUIRY_FILE_2 = "住基照会用ファイル②.csv";
const NATURALIZED_CITIZEN_FILE = '帰化対象者.csv';
const BENEFICIARY_FILE = '新たな給付_給付対象者.csv';
const PUSH_TARGET_FLG_FILE = '新たな給付_直接振込対象者.csv';
const PUBLIC_ACCOUNT_FILE = '新たな給付_公金受取口座情報.csv';
const TAX_INFO_MASTER = '税情報マスタ.csv';
const NUMBER_OF_DATA_DIVISION = 10000; // 税情報データ分割数
const NEWLINE_CHAR_CRLF = '\r\n'; // 改行コード：CRLF

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

/**
 * 中間サーバ照会用のファイルを作成する処理（他ステップでも使用する予定のため、Globalのfunctionとして作成した）
 * @param {string} text - 整形のインプットとなるテキストデータ。
 * @param {string} procedureCode - 固定値として使用する「事務手続きコード」。
 * @param {string} personalInfoCode - 固定値として使用する「特定個人情報名コード」。
 * @param {boolean} [variableAndFixedSwitch=false] - 「転入元都道府県市区町村コード」カラムを固定値か可変値か切り替える。（デフォルトは可変値）
 * @returns {string} - 生成された固定長ファイルのテキストデータ。
 */
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
    // semiColumn13は再代入可能な変数として定義し、デフォルト引数「variableAndFixedSwitch」で値を切り替える（基本は可変値として定義する）
    let semiColumn13 = { length: 16, name: '転入元都道府県市区町村コード', padding: ' ', padDirection: 'right' };

    // 公金口座照会用ファイル作成の場合「1419900000002200（固定値）」を再代入する
    if (variableAndFixedSwitch) {
        semiColumn13 = { length: 16, name: '転入元都道府県市区町村コード', padding: ' ', padDirection: 'right', value: '1419900000002200' };
    }

    const column13 = semiColumn13;
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

function outputOnlyErrorRecordDatFile() {
    const fileIds = ['file10', 'errorFile1'];
    const noTaxinfoFile = "[only error rows]P640R110_" + getCurrentTime().replace(/[:.\-\s]/g, '').trim().slice(0, 14); // 税情報照会用ファイル（YYYYMMDDHHmmssの14桁）
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
    if (!files[0].name.startsWith('中間ファイル④')) {
        alert('アップロードするファイル名を「中間ファイル④」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル②」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 5(ERROR対応) 処理を開始しました');

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
                    const middle_file_4_str = results[0];
                    const errorAddress = parseCSV(results[1]);
                    // 右から10桁のみを取得
                    const errorAddressNums = errorAddress.rows.map(line => line[0].slice(-10));
                    // 必要なヘッダーがあるかチェック
                    const { header, rows } = parseCSV(middle_file_4_str);
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
                    const filteredText = FilterTaxAndAddressAndMovementReason(columnIndices, header, rows, errorAddressNums);
                    if (!filteredText) {
                        logger.warn('■ファイル名：' + noTaxinfoFile + ' >> 出力対象レコードが存在しませんでした。');
                    } else {
                        downloadCSV(filteredText, noTaxinfoFile, true);
                    }

                    //const mergedCSV = deleteRows(results[0], results[1], ['宛名番号', '世帯番号']);

                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 5(ERROR対応) 処理を終了しました');
                }
            }
        };
        reader.readAsText(files[index]);
    });
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
        // 税情報照会ファイルがヘッダー無しファイルのため、ファイル一行目ヘッダーを追加する
        csvText2 = createHeaderForTaxInfoInquiryFile(csvText2);

        // CSVテキストを行ごとに分割して配列に変換
        const arrayFromMidFile = parseCSV(csvText1);
        const arrayFromInquiryResult = parseCSV(csvText2);

        // ヘッダー行を取得
        const midFileHeader = arrayFromMidFile.header;
        const inquiryResultHeader = arrayFromInquiryResult.header;
        // 中間ファイル④の必要カラムindexを指定する
        const addressNumIndex1 = midFileHeader.indexOf('宛名番号');
        const taxClassIndex = midFileHeader.indexOf('課税区分');
        const residentsDateIndex = midFileHeader.indexOf('住民日');
        // 税情報照会結果ファイルの必要カラムindexを指定する
        const addressNumIndex2 = inquiryResultHeader.indexOf('宛名番号');
        const formerAddressCodeIndex = inquiryResultHeader.indexOf('情報提供者機関コード');
        const inquiryStatusFromParticularsIndex = inquiryResultHeader.indexOf('照会ステータス（明細単位）');
        const inquiryMessageIndex = inquiryResultHeader.indexOf('照会処理結果メッセージ（明細単位）');
        const inquiryStatusFromPersonalInfoIndex = inquiryResultHeader.indexOf('照会ステータス（特定個人情報名単位）');
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
        if (residentsDateIndex === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：住民日');
        }

        if (missingColumns.length > 0) {
            throw new Error('以下のカラムが見つかりません。ファイルの確認をお願いします。\n' + missingColumns.join('\n'));
        }

        // 警告表示用：中間ファイルの宛名番号をセットにする
        const midFileAddressNumSet = new Set(arrayFromMidFile.rows.map(row => row[addressNumIndex1]));
        // 警告表示対象（中間ファイルに存在せず、税情報照会結果ファイルに存在する宛名番号）のリストを定義する
        const errorAddressNums = [];

        // 税情報照会結果ファイルの宛名番号をキーにして、均等割額・所得割額をマップにする
        const taxMap = {};
        arrayFromInquiryResult.rows.forEach(inquiryRow => {
            // 税情報照会結果ファイルの宛名番号は先頭5桁が0埋めされているため、右から10桁を取得する
            const addressNumFromResultFile = inquiryRow[addressNumIndex2].slice(-10);
            // 情報提供者機関コード（前住所コード）を取得する
            const formerAddressCode = inquiryRow[formerAddressCodeIndex];
            // 照会結果メッセージを取得する
            const inquiryMessage = String(inquiryRow[inquiryMessageIndex]);
            // 照会ステータスコード2種はNumber型ではなく文字列で取得する)
            const inquiryStatusFromParticulars = String(inquiryRow[inquiryStatusFromParticularsIndex]);
            const inquiryStatusFromPersonalInfo = String(inquiryRow[inquiryStatusFromPersonalInfoIndex]);
            // 所得割額、均等割額はNumber型で取得する。空の場合Number型で取得すると0になるため、空の場合は空文字列にする
            const equalBracket = inquiryRow[equalBracketIndex] !== '' ? Number(inquiryRow[equalBracketIndex]) : '';
            const incomePercentage = inquiryRow[incomePercentageIndex] !== '' ? Number(inquiryRow[incomePercentageIndex]) : '';

            // 中間ファイルに存在しない宛名番号がある場合、警告表示対象リストに追加する
            if (!midFileAddressNumSet.has(addressNumFromResultFile)) {
                errorAddressNums.push(addressNumFromResultFile);
            }

            // 照会結果ファイルの必要情報を、宛名番号と紐づけてにする
            taxMap[addressNumFromResultFile] = [formerAddressCode, inquiryMessage, inquiryStatusFromParticulars, inquiryStatusFromPersonalInfo, equalBracket, incomePercentage];
        });

        // 警告表示対象の宛名番号が存在する場合、警告文を表示したうえでCSVファイルを出力する
        if (errorAddressNums.length > 0) {
            logger.warn("税情報照会結果に存在し、中間ファイル④に存在しない宛名番号が検出されました。\n件数：" + errorAddressNums.length);
            downloadCSV(errorAddressNums.join('\r\n'), "税情報照会結果に存在し、中間ファイル④に存在しない宛名番号.csv");
        }

        // 税情報照会結果に載っている住民の中で、「「住民日」がR6.1.1よりあと」である住民の宛名番号を収集するリストを定義する（最終的にファイルとしてアウトプットする）
        const outOfResidentDateAddressNums = [];
        // 最終的に課税区分に値が入らなかった住民の宛名番号を収集するリストを定義する（最終的にファイルとしてアウトプットする）
        const noTaxInfoAddressNums = [];
        // 日付比較用に、20240102をdate型にする
        const targetDate = new Date('2024-01-01 00:00:00');

        // 中間ファイル④にて、宛名番号に対応する課税区分を更新する（中間ファイル④の一行毎に処理を実施）
        arrayFromMidFile.rows.forEach(midRow => {
            const addressNumFromMidFile = midRow[addressNumIndex1]; // 中間ファイル内の宛名番号を取得する
            const residentDateFromMidFile = parseDate(midRow[residentsDateIndex]); // 中間ファイル内の宛名番号をDate型で取得する

            if (taxMap.hasOwnProperty(addressNumFromMidFile)) {
                const formerAddressCode = taxMap[addressNumFromMidFile][0]; // 照会結果の前住所コードを取得する（空白かどうかを判定するため）
                const inquiryMessage = taxMap[addressNumFromMidFile][1]; // 照会結果メッセージを取得する（住基照会用ファイルに入れるかを判定するため）
                const inquiryStatusFromParticulars = taxMap[addressNumFromMidFile][2]; // 税情報照会結果の照会ステータス（明細単位）を取得する（正常終了かどうかを判定するため）
                const inquiryStatusFromPersonalInfo = taxMap[addressNumFromMidFile][3]; // 税情報照会結果の照会ステータス（特定個人情報名単位）を取得する（正常終了かどうかを判定するため）
                const equalBracket = taxMap[addressNumFromMidFile][4]; // 税情報照会結果の均等割額を取得する（課税区分を判定するため）
                const incomePercentage = taxMap[addressNumFromMidFile][5]; // 税情報照会結果の所得割額を取得する（課税区分を判定するため）

                // 2種類の照会ステータスを確認し、照会が正常に終了している場合には、1~3で課税区分を更新する
                if (inquiryStatusFromParticulars === '09' && inquiryStatusFromPersonalInfo === '01') {
                    // 「所得割額」が0かつ、「均等割額」が0であるものを非課税(1)判定
                    if (incomePercentage === 0 && equalBracket === 0) {
                        midRow[taxClassIndex] = '1';
                    }
                    // 「所得割額」が0かつ、「均等割額」が1以上であるものを均等割りのみ課税(2)判定
                    else if (incomePercentage === 0 && equalBracket > 0) {
                        midRow[taxClassIndex] = '2';
                    }
                    // 「所得割額」が1以上かつ、「均等割額」が1以上であるものを課税(3)判定
                    else if (incomePercentage > 0 && equalBracket > 0) {
                        midRow[taxClassIndex] = '3';
                    }
                    // 「所得割額」が1以上のときは「均等割額」が1以上になるはずのため、「均等割額」が0のものはエラーとして投げる
                    else if (incomePercentage > 0 && equalBracket === 0) {
                        throw new Error('【宛名番号：' + String(addressNumFromMidFile) + 'の課税情報】\n「所得割額」が1以上ですが「均等割額」が0となっております。インプットファイルを確認してください。')
                    }
                }

                // 照会が正常に終了していない（前住所コード（=照会結果カラム13列目）が空白の）場合、その住民の住民日が2024/1/1以前かどうかを判定する
                else if (formerAddressCode === '') {
                    // 住民日が2024/1/1以前の場合、課税区分に「4（未申告）」を入れる
                    if (residentDateFromMidFile <= targetDate) {
                        midRow[taxClassIndex] = '4';
                    }
                    // 条件に当てはまらない場合、課税区分に「99（フラグ用）」を入れたのち、リストに宛名番号を追加する
                    else {
                        midRow[taxClassIndex] = '99';
                        outOfResidentDateAddressNums.push(addressNumFromMidFile);
                    }
                }

                // 照会が正常に終了していない（エラー・未取得・不明である）場合は別途照会を行うが、住基照会用ファイルに入らないよう、課税区分に99（フラグ用）を入れる
                else if (inquiryMessage === '指定された団体内統合宛名番号「０００００００１４６８９４２７」は符号が未取得です。'
                    || inquiryMessage === '「レコード識別番号」が既に存在しています。'
                    || inquiryMessage === '指定された特定個人情報名「ＴＭ０００００００００００００２」の照会は許可されていません。') {
                    midRow[taxClassIndex] = '99';
                }

                // その他（上記のエラーパターン以外のエラーで税情報が取得できていない住民）はStep8の出力ファイルを使用して再度照会をかけるため、この場では空を返す
                else {
                    midRow[taxClassIndex] = '';
                    noTaxInfoAddressNums.push(addressNumFromMidFile);
                }
            }
        });

        // 「「住民日」がR6.1.1よりあと」である住民の宛名番号がある場合リストを出力する
        if (outOfResidentDateAddressNums.length > 0) {
            logger.warn("「前住所地の住所コード」が無いかつ、「住民日」がR6.1.1よりあとである住民が検出されました。\n件数：" + outOfResidentDateAddressNums.length);
            downloadCSV(outOfResidentDateAddressNums.join('\r\n'), "「前住所地の住所コード」が無いかつ「住民日」がR6.1.1よりあとである宛名番号.csv");
        }

        // 「課税区分」が空の住民がある場合、対象住民の宛名番号のリストを出力する
        if (noTaxInfoAddressNums.length > 0) {
            logger.warn("課税区分が空である住民が" + noTaxInfoAddressNums.length + "件検出されました。");
            downloadCSV(noTaxInfoAddressNums.join('\r\n'), "課税区分が空の住民の宛名番号.csv");
        }

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

        // 警告表示用：中間ファイルの宛名番号をセットにする
        const midFileAddressNumSet = new Set(arrayFromMidFile.rows.map(row => row[addressNumIndex1]));
        // 警告表示対象（中間ファイルに存在せず、帰化対象者税情報照会結果ファイルに存在する宛名番号）のリストを定義する
        const errorAddressNums = [];

        // 帰化対象者税情報照会結果ファイルの宛名番号をキーにして税区分をマップにする
        const taxMap = {};
        arrayFromNaturalizedCitizenFile.rows.forEach(inquiryrow => {
            const addressNumFromResultFile = inquiryrow[addressNumIndex2].padStart(10, '0'); // 帰化対象者の宛名番号を取得
            const taxClassFromResultFile = inquiryrow[taxClassIndex2]; // 帰化対象者の税区分を取得

            // 中間ファイルに存在しない宛名番号がある場合、警告表示対象リストに追加する
            if (!midFileAddressNumSet.has(addressNumFromResultFile)) {
                errorAddressNums.push(addressNumFromResultFile);
            }

            taxMap[addressNumFromResultFile] = taxClassFromResultFile; // 宛名番号をキーにして税区分をマップに格納する
        });

        // 警告表示対象の宛名番号が存在する場合、警告文を表示したうえでCSVファイルを出力する
        if (errorAddressNums.length > 0) {
            logger.warn("帰化対象者税情報照会結果に存在し、中間ファイル⑤に存在しない宛名番号が検出されました。\n件数：" + errorAddressNums.length);
            downloadCSV(errorAddressNums.join('\r\n'), "帰化対象者税情報照会結果に存在し、中間ファイル⑤に存在しない宛名番号.csv");
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
                //税区分が返ってきていない（2次照会にかける）住民は課税区分を空にする（Step8で住基照会用ファイルに出力する）
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
                '住民票コード',
                '続柄１'
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
     * ①課税区分が「空」「3」「4」「99」でない（「1」か「2」である）②前住所コードが「99999」でない ③続柄１が「02」である行を抽出し、ファイル形式を整える処理
     */
    function generatePublicAccountInquiryFile(columnIndices, header, rows) {
        // 条件に合致するレコードのみをフィルタする
        const filteredLines = rows.filter(line => {
            const [taxClassification, previousAddressCode, familyRelationship] = [
                line[columnIndices[2]],
                line[columnIndices[3]],
                line[columnIndices[6]]
            ];
            return taxClassification !== '' && taxClassification !== '3' && taxClassification !== '4' && taxClassification !== '99' && previousAddressCode !== '99999' && familyRelationship === '02';
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
            // 課税区分が空でない、もしくは「未申告（=4）でない行 または ②前住所コードが「99999」でない行を抽出する
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















/* 追加対応1. 賦課マスタと番号連携結果（税情報）ファイルをマージし、税情報マスタファイルを作成する処理*/
function mergeTaxInfoFiles() {
    const fileIds = ['file34', 'file35'];
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files, true);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」もしくは「.DAT」で終わらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('追加対応1 処理を開始しました');

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
                    const mergedTaxInfoText = generateTaxInfoMasterFile(results[0], results[1]);
                    downloadCSV(mergedTaxInfoText, TAX_INFO_MASTER);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('追加対応1 処理を終了しました');
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function generateTaxInfoMasterFile(csvText1, csvText2) {
        // 税情報照会結果ファイルがヘッダー無しファイルのため、ファイル一行目ヘッダーを追加する
        csvText2 = createHeaderForTaxInfoInquiryFile(csvText2);

        // CSVテキストを行ごとに分割して配列に変換
        const arrayFromLevyMaster = parseCSV(csvText1);
        const arrayFromInquiryResult = parseCSV(csvText2);

        // ヘッダー行を取得（賦課マスタのヘッダー行からは「ＦＩ－」を取り除く）
        const levyMasterHeader = removeStrFromHeader(arrayFromLevyMaster.header, "ＦＩ－");
        const inquiryResultHeader = arrayFromInquiryResult.header;

        // 賦課マスタの必要カラムindexを指定する
        const addressNumIndex1 = levyMasterHeader.indexOf('宛名番号');

        // 税情報照会結果ファイルの必要カラムindexを指定する
        const addressNumIndex2 = inquiryResultHeader.indexOf('宛名番号');
        const inquiryStatusFromParticularsIndex = inquiryResultHeader.indexOf('照会ステータス（明細単位）');
        const inquiryStatusFromPersonalInfoIndex = inquiryResultHeader.indexOf('照会ステータス（特定個人情報名単位）');
        const equalBracketIndex = inquiryResultHeader.indexOf('市町村民税均等割額');
        const incomePercentageIndex = inquiryResultHeader.indexOf('市町村民税所得割額（定額減税前）');

        // 各ファイルのマージ結果を格納する配列を定義する
        const map = new Map();

        // 賦課マスタのデータをMapに格納する
        arrayFromLevyMaster.rows.forEach(row => {
            const levyAddressNum = row[addressNumIndex1];
            // headersとrowからオブジェクトを生成する
            const rowObj = levyMasterHeader.reduce((obj, header, i) => {
                obj[header] = row[i];
                return obj;
            }, {});
            map.set(levyAddressNum, rowObj);
        });

        // 税情報照会結果ファイルのデータをMapに格納する
        arrayFromInquiryResult.rows.forEach(row => {
            // 税情報照会結果の宛名番号は左側0埋め15桁になっているため、右10桁を取得する
            const inquiryAddressNum = row[addressNumIndex2].slice(-10);
            const inquiryStatusFromParticulars = String(row[inquiryStatusFromParticularsIndex]);
            const inquiryStatusFromPersonalInfo = String(row[inquiryStatusFromPersonalInfoIndex]);

            // headersとrowからオブジェクトを生成する
            const rowObj = inquiryResultHeader.reduce((obj, header, i) => {
                obj[header] = row[i];
                return obj;
            }, {});

            // 2種類の照会ステータスを確認し、照会が正常に終了している場合にはマージ（もしくは行追加）処理を実行する
            if (inquiryStatusFromParticulars === '09' && inquiryStatusFromPersonalInfo === '01') {
                // 賦課マスタに存在する宛名番号の場合、マージ処理を実行する
                if (map.has(inquiryAddressNum)) {
                    // todo:エラー表示する
                    const existingRow = map.get(inquiryAddressNum);
                    existingRow['均等割額'] = row[equalBracketIndex];
                    existingRow['所得割額'] = row[incomePercentageIndex];
                    map.set(inquiryAddressNum, existingRow);
                }
                // 賦課マスタに無い宛名番号の場合、最終行に続く形で行ごと追加する
                else {
                    const newRow = levyMasterHeader.reduce((obj, header) => {
                        obj[header] = "";
                        return obj;
                    }, {});
                    newRow['宛名番号'] = inquiryAddressNum;
                    newRow['均等割額'] = row[equalBracketIndex];
                    newRow['所得割額'] = row[incomePercentageIndex];
                    map.set(inquiryAddressNum, newRow);
                }
            }
        });

        const outputRows = [];
        map.forEach(value => {
            const row = levyMasterHeader.map(header => value[header] || '');
            outputRows.push(row.join(','));
        });

        // フィルタリングされた行をCSV形式に戻す
        // todo :function作成
        return [levyMasterHeader, ...outputRows].join('\r\n') + '\r\n';
    }
}

/* 追加対応2. 世帯全員が所得割課税者 or 均等割のみ課税に扶養されている住民を除外する処理 */
function additionalExclusion() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['file36', 'file37', 'file38'];
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

    // 「中間ファイル⑥」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル⑥')) {
        alert('アップロードするファイル名を「中間ファイル⑥」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル⑥」で始まらない場合はエラーを出して処理終了
    }

    // 「中間ファイル⑥」がインプットされたことを確認する（前方一致で確認）
    if (!files[1].name.startsWith('税情報マスタ')) {
        alert('アップロードするファイル名を「税情報マスタ」から始まるものにして下さい。');
        return; // ファイル名が「税情報マスタ」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('追加対応2 処理を開始しました');

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
                    const additionalExclusionText = excludeHouseholdsDependentTaxpayer(...results);
                    downloadCSV(additionalExclusionText, MIDDLE_FILE_6_ADDITIONAL_EXCLUSION);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('追加対応2 処理を終了しました');
                }
            }
        };

        // onloadイベントを発火
        reader.readAsText(files[index]);
    });

    function excludeHouseholdsDependentTaxpayer(...csvFiles) {
        // 各CSVファイルをヘッダーとデータ行に分解し、1行ずつ配列に格納する
        const parsedCSVs = csvFiles.map(csv => parseCSV(csv));
        // 個人基本マスタヘッダー内の「ＦＩ－」を取り除く
        parsedCSVs[2].header = removeStrFromHeader(parsedCSVs[2].header, "ＦＩ－");
        // 中間ファイル⑥の全ヘッダーと、各ファイルの必要カラムのヘッダーをマージする
        const fullHeader = Array.from(new Set([...parsedCSVs[0].header, "配偶者特別控除", "個人基本廃止理由", "夫婦関連者種別コード", "夫婦関連者宛名番号", "扶養関連者宛名番号", "専従関連者種別コード", "専従関連者宛名番号"]));
        // 出力用のCSVデータを定義する
        const output = [fullHeader.join(',')];
        // 各CSVファイルの「宛名番号」カラムのインデックスを取得し、配列に保存する→各ファイルで「宛名番号」がどの位置にあるかを把握する
        const addressIndex = parsedCSVs.map(parsed => parsed.header.indexOf('宛名番号'));

        // 中間ファイル⑥を基準にマッピングし、各ファイルのマージ処理を行う
        const map = new Map();

        parsedCSVs[0].rows.forEach(row => {
            const addressNum = row[addressIndex[0]];
            // headersとrowからオブジェクトを生成する
            const rowObj = parsedCSVs[0].header.reduce((obj, header, i) => {
                obj[header] = row[i];
                return obj;
            }, {});
            map.set(addressNum, rowObj);
        });

        // 税情報マスタのマージ対象カラム（後続の判定に必要な「配偶者特別控除」のみ）を指定する
        const levyColumns = ["配偶者特別控除"];

        // 税情報マスタのマージ処理
        parsedCSVs[1].rows.forEach(row => {
            const levyAddressNum = row[addressIndex[1]];
            if (map.has(levyAddressNum)) {
                // headersとrowからオブジェクトを生成する
                const rowObj = parsedCSVs[1].header.reduce((obj, header, i) => {
                    // マージ対象のカラムの場合、オブジェクトに追加する
                    if (levyColumns.includes(header)) {
                        obj[header] = row[i];
                    }
                    return obj;
                }, {});
                // 対象のカラムの場合マージ処理を実行する
                map.set(levyAddressNum, { ...map.get(levyAddressNum), ...rowObj });
            }
        });

        // 個人基本マスタのマージ対象カラム（後続の判定に必要な「個人基本廃止理由」「夫婦関連者種別コード」「夫婦関連者宛名番号」「扶養関連者宛名番号」「専従関連者種別コード」「専従関連者宛名番号」）を指定する
        const personalBasicColumns = ["個人基本廃止理由", "夫婦関連者種別コード", "夫婦関連者宛名番号", "扶養関連者宛名番号", "専従関連者種別コード", "専従関連者宛名番号"];

        // 個人基本マスタのマージ処理
        parsedCSVs[2].rows.forEach(row => {
            const personalBasicAddressNum = row[addressIndex[2]];
            if (map.has(personalBasicAddressNum)) {
                // headersとrowからオブジェクトを生成する
                const rowObj = parsedCSVs[2].header.reduce((obj, header, i) => {
                    // マージ対象のカラムの場合、オブジェクトに追加する
                    if (personalBasicColumns.includes(header)) {
                        obj[header] = row[i];
                    }
                    return obj;
                }, {});
                // 対象のカラムの場合マージ処理を実行する
                map.set(personalBasicAddressNum, { ...map.get(personalBasicAddressNum), ...rowObj });
            }
        });

        // 4つの条件から扶養を受けている住民（被扶養者）を検索し、該当レコードの世帯番号、関連者宛名番号（扶養者の宛名番号）、扶養形式（後続処理に使用するフラグ）を配列に格納する
        const dependentTaxpayerSet = [];

        map.forEach(value => {
            // 条件① : 「夫婦関連者種別コード」が11,13,15,17,19,1B,1D,1F,1Hのいずれかであるかつ、「夫婦関連者宛名番号」が入力されているかつ、「個人基本廃止理由」が空であるレコードを検索する
            if (['11', '13', '15', '17', '19', '1B', '1D', '1F', '1H'].includes(value['夫婦関連者種別コード']) && value['夫婦関連者宛名番号'] && !value['個人基本廃止理由']) {
                dependentTaxpayerSet.push({
                    世帯番号: value['世帯番号'],
                    扶養者宛名番号: value['夫婦関連者宛名番号'],
                    扶養形式: '控配'
                });
            }
            // 条件② : 条件①に当てはまらないかつ、「扶養関連者宛名番号」が入力されているかつ、個人基本廃止理由が空であるレコードを検索する
            else if (value['扶養関連者宛名番号'] && !value['個人基本廃止理由']) {
                dependentTaxpayerSet.push({
                    世帯番号: value['世帯番号'],
                    扶養者宛名番号: value['扶養関連者宛名番号'],
                    扶養形式: '扶養'
                });
            }
            // 条件③ : 条件①②に当てはまらないかつ、「夫婦関連者種別コード」が10であるかつ、「配偶者特別控除」が0より大きいかつ、「夫婦関連者宛名番号」が入力されているかつ、「個人基本廃止理由」が空であるレコードを検索する
            else if (value['夫婦関連者種別コード'] === '10' && value['配偶者特別控除'] > 0 && value['夫婦関連者宛名番号'] && !value['個人基本廃止理由']) {
                dependentTaxpayerSet.push({
                    世帯番号: value['世帯番号'],
                    扶養者宛名番号: value['夫婦関連者宛名番号'],
                    扶養形式: '配偶者'
                });
            }
            // 条件④ : 条件①②③に当てはまらないかつ、「専従関連者種別コード」が41であるかつ、「専従関連者宛名番号」が入力されているかつ、「個人基本廃止理由」が空であるレコードを検索する
            else if (value['専従関連者種別コード'] === '41' && value['専従関連者宛名番号'] && !value['個人基本廃止理由']) {
                dependentTaxpayerSet.push({
                    世帯番号: value['世帯番号'],
                    扶養者宛名番号: value['専従関連者宛名番号'],
                    扶養形式: '専従'
                });
            }
        });

        //     // dependentTaxpayerSetの各データの扶養者宛名番号について、税情報マスタファイル内「宛名番号」カラムに検索をかける
        //     // todo 引数、forでいいかも　Setじゃない奴の名前修正
        //     dependentTaxpayerSet.forEach((dependentTaxpayer, index) => {
        //         // 検索ヒットした行の更正事由、所得割額、均等割額の値を参照し、課税区分判定を実施する
        //         parsedCSVs[1].rows.forEach(row => {
        //             if (row[parsedCSVs[1].header.indexOf('宛名番号')] === dependentTaxpayerSet[index]['扶養者宛名番号']) {
        //                 const causeForCorrection = String(row[parsedCSVs[1].header.indexOf('更正事由')]); // 更正事由
        //                 const incomePercentage = Number(row[parsedCSVs[1].header.indexOf('所得割額')]); // 所得割額
        //                 const equalPercentage = Number(row[parsedCSVs[1].header.indexOf('均等割額')]); // 均等割額
        //                 let taxClass; // 最終的に配列に格納する課税区分

        //                 // 「所得割額」が0かつ、「均等割額」が0かつ、「更正事由」の先頭２桁が03でないものを非課税(1)判定
        //                 if (incomePercentage == 0 && equalPercentage == 0 && !causeForCorrection.startsWith("03")) {
        //                     taxClass = '1';
        //                 }
        //                 // 「所得割額」が0かつ、「均等割額」が1以上かつ、「更正事由」の先頭２桁が03でないものを均等割りのみ課税(2)判定
        //                 else if (incomePercentage == 0 && equalPercentage > 0 && !causeForCorrection.startsWith("03")) {
        //                     taxClass = '2';
        //                 }
        //                 // 「所得割額」が1以上かつ、「均等割額」が1以上かつ、「更正事由」の先頭２桁が03でないものを課税(3)判定
        //                 else if (incomePercentage > 0 && equalPercentage > 0 && !causeForCorrection.startsWith("03")) {
        //                     taxClass = '3';
        //                 }
        //                 // 「更正事由」の先頭２桁が03であるものは、「所得割額」「所得割額」に関わらず未申告(4)判定
        //                 else if (causeForCorrection.startsWith("03")) {
        //                     taxClass = '4';
        //                 }
        //                 else {
        //                     taxClass = '';
        //                 }

        //                 // 課税区分を配列に追加格納する
        //                 dependentTaxpayerSet[index] = {
        //                     ...dependentTaxpayerSet[index],
        //                     扶養者課税区分: taxClass
        //                 };
        //             }
        //         });
        //     });

        const headerMap = parsedCSVs[1].header.reduce((map, header, index) => {
            map[header] = index;
            return map;
        }, {});

        for (let index = 0; index < dependentTaxpayerSet.length; index++) {
            const dependentTaxpayer = dependentTaxpayerSet[index];
            // 宛名番号が一致する行をフィルタリング
            const targetRows = parsedCSVs[1].rows.filter(row =>
                row[headerMap['宛名番号']] === dependentTaxpayer['扶養者宛名番号']
            );

            for (let i = 0; i < targetRows.length; i++) {
                const row = targetRows[i];
                const causeForCorrection = String(row[headerMap['更正事由']]); // 更正事由
                const incomePercentage = Number(row[headerMap['所得割額']]); // 所得割額
                const equalPercentage = Number(row[headerMap['均等割額']]); // 均等割額
                let taxClass; // 最終的に配列に格納する課税区分

                // 「所得割額」が0かつ、「均等割額」が0かつ、「更正事由」の先頭２桁が03でないものを非課税(1)判定
                if (incomePercentage === 0 && equalPercentage === 0 && !causeForCorrection.startsWith("03")) {
                    taxClass = '1';
                }
                // 「所得割額」が0かつ、「均等割額」が1以上かつ、「更正事由」の先頭２桁が03でないものを均等割りのみ課税(2)判定
                else if (incomePercentage === 0 && equalPercentage > 0 && !causeForCorrection.startsWith("03")) {
                    taxClass = '2';
                }
                // 「所得割額」が1以上かつ、「均等割額」が1以上かつ、「更正事由」の先頭２桁が03でないものを課税(3)判定
                else if (incomePercentage > 0 && equalPercentage > 0 && !causeForCorrection.startsWith("03")) {
                    taxClass = '3';
                }
                // 「更正事由」の先頭２桁が03であるものは、「所得割額」「所得割額」に関わらず未申告(4)判定
                else if (causeForCorrection.startsWith("03")) {
                    taxClass = '4';
                }
                else {
                    taxClass = '';
                }

                // 課税区分を配列に追加格納する
                dependentTaxpayerSet[index] = {
                    ...dependentTaxpayerSet[index],
                    扶養者課税区分: taxClass
                };
            }
        }


        // dependentTaxpayerSet内、「扶養者課税区分」が「2（＝均等割のみ課税）」もしくは「3（＝課税）」であるデータのみ抽出する（後続処理をわかりやすくするため）
        const filteredDependentTaxpayerSet = dependentTaxpayerSet.filter(dependentTaxpayer => dependentTaxpayer['扶養者課税区分'] === '2' || dependentTaxpayer['扶養者課税区分'] === '3');

        // 抽出したデータごとに後続処理を実施する
        for (let i = 0; i < filteredDependentTaxpayerSet.length; i++) {
            const filtereddependentTaxpayer = filteredDependentTaxpayerSet[i];
            // 検索ヒットした住民の扶養者宛名番号カラムの値をいれるための配列（後続処理で判定用として使用する配列）を定義する
            const relatedAddressNums = [];

            // map（中間ファイル＋税情報マスタ＋個人基本マスタ）内「世帯番号」が、filteredDependentTaxpayerSetの「世帯番号」と一致するものを検索し、ヒットした全行の「扶養者宛名番号」を配列に格納する
            for (let j = 0; j < map.size; j++) {
                const [key, value] = Array.from(map.entries())[j];
                if (value['世帯番号'] === filtereddependentTaxpayer['世帯番号']) {
                    // 扶養者宛名番号として「夫婦関連者宛名番号」「扶養関連者宛名番号」「専従関連者宛名番号」の種類があるため、filteredDependentTaxpayerSet内の「扶養形式」によって取得するカラムを判定する
                    // 扶養形式が「控配」もしくは「配偶者」の場合、「夫婦関連者宛名番号」を取得する（扶養者宛名番号が無い場合もあるため、その場合は空文字列を追加する）
                    if (filtereddependentTaxpayer['扶養形式'] === '控配' || filtereddependentTaxpayer['扶養形式'] === '配偶者') {
                        relatedAddressNums.push(value['夫婦関連者宛名番号'] || '');
                    }
                    // 扶養形式が「扶養」の場合、「扶養関連者宛名番号」を取得する（扶養者宛名番号が無い場合もあるため、その場合は空文字列を追加する）
                    else if (filtereddependentTaxpayer['扶養形式'] === '扶養') {
                        relatedAddressNums.push(value['扶養関連者宛名番号'] || '');
                    }
                    // 扶養形式が「専従」の場合、「専従関連者宛名番号」を取得する（扶養者宛名番号が無い場合もあるため、その場合は空文字列を追加する）
                    else if (filtereddependentTaxpayer['扶養形式'] === '専従') {
                        relatedAddressNums.push(value['専従関連者宛名番号'] || '');
                    }
                }
            }

            // 取得した扶養者宛名番号配列の中に、filteredDependentTaxpayerSetの「扶養者宛名番号」と一致しないものがあるか判定する
            const allMatchJudge = relatedAddressNums.every(addressNum => addressNum === filtereddependentTaxpayer['扶養者宛名番号']);
            // 判定結果でTrue（全行の扶養者宛名番号の値とfilteredDependentTaxpayerSetの扶養者の値が一致している）場合、同世帯番号に属する全レコードをmapから除外する
            if (allMatchJudge) {
                // 削除対象のキーを収集する配列を定義
                const keysToDelete = [];

                // 削除対象のキーを収集
                map.forEach((value, key) => {
                    if (value['世帯番号'] === filtereddependentTaxpayer['世帯番号']) {
                        keysToDelete.push(key);
                    }
                });

                // 収集したキーを使ってmapからエントリーを削除
                keysToDelete.forEach(key => map.delete(key));
            }
        }

        map.forEach(value => {
            const row = fullHeader.map(header => value[header] || '');
            output.push(row.join(','));
        });
        return output.join('\r\n') + '\r\n';
    }

}























/* 9.中間ファイル⑥と公金口座照会結果ファイルをマージする処理 */
function mergePublicFundAccountInfo() {
    const fileIds = ['file22', 'file23'];
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files, true);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」もしくは「.DAT」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル⑥」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル⑥')) {
        alert('アップロードするファイル名を「中間ファイル⑥」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル⑥」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 9 処理を開始しました');

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
                    const mergedPublicFundAccountInfoText = mergePublicFundAccountInfoByNonHeaderFile(results[0], results[1]);
                    downloadCSV(mergedPublicFundAccountInfoText, MIDDLE_FILE_7);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 9 処理を終了しました');
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function mergePublicFundAccountInfoByNonHeaderFile(csvText1, csvText2) {
        // 公金口座情報ファイルがヘッダー無しファイルのため、ファイル一行目に追加する用のヘッダーを定義する
        let column = new Array(52);

        // カラムが最初空文字列で初期化されているため、1から始まるようにする
        for (let i = 0; i < column.length; i++) {
            column[i] = i + 1;
        }

        // 後続処理で使用するカラム名は連番とは別で定義する
        column[1] = '宛名番号';
        column[26] = '照会処理結果メッセージ（特定個人情報名単位）';
        column[34] = '金融機関コード';
        column[38] = '店番';
        column[42] = '預貯金種目コード';
        column[44] = '口座番号';
        column[46] = '名義人氏名';

        // ヘッダー配列を「,」で区切り、税情報照会ファイルの先頭に追加する
        csvText2 = column.join(',') + '\r\n' + csvText2;

        // CSVテキストを行ごとに分割して配列に変換
        const arrayFromMidFile = parseCSV(csvText1);
        const arrayFromInquiryResult = parseCSV(csvText2);

        // 各ファイルのヘッダー行を取得
        const midFileHeader = arrayFromMidFile.header;
        const inquiryResultHeader = arrayFromInquiryResult.header;
        // 宛名番号indexを指定する
        const addressNumIndex1 = midFileHeader.indexOf('宛名番号');
        const addressNumIndex2 = inquiryResultHeader.indexOf('宛名番号');
        // 後続処理に使用するカラムのindexを指定する
        const inquiryResultMessageIndex = inquiryResultHeader.indexOf('照会処理結果メッセージ（特定個人情報名単位）');
        // 中間ファイル⑥のヘッダーに公金口座照会結果ファイルの必要項目ヘッダーを追加し、アウトプット時のヘッダーを作成する
        const fullHeader = Array.from(new Set([...midFileHeader, inquiryResultHeader[34], inquiryResultHeader[38], inquiryResultHeader[42], inquiryResultHeader[44], inquiryResultHeader[46]]));
        // 出力用のCSVデータを定義する
        const output = [fullHeader.join(',')];

        // エラーハンドリング（必要なカラムが存在しない場合、ファイル名とカラムを表示する）
        const missingColumns = [];
        if (addressNumIndex1 === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：宛名番号');
        }

        if (missingColumns.length > 0) {
            throw new Error('以下のカラムが見つかりません。ファイルの確認をお願いします。\n' + missingColumns.join('\n'));
        }

        // 中間ファイル⑥を基準にマッピングし、マージ処理を行う
        const map = new Map();
        arrayFromMidFile.rows.forEach(row => {
            const addressNumber = row[addressNumIndex1];
            // headersとrowからオブジェクトを生成する
            const rowObj = arrayFromMidFile.header.reduce((obj, header, i) => {
                obj[header] = row[i];
                return obj;
            }, {});
            map.set(addressNumber, rowObj);
        });

        // 中間ファイルに存在しない宛名番号を格納する変数
        let nonExistingAddresseeNumber = [];
        let nonExistingAddresseeNumberMap = new Map();

        // 宛名番号をキーにしてマージ処理を行う
        arrayFromInquiryResult.rows.forEach(row => {
            // 公金受取口座照会結果ファイルの宛名番号は左側0埋め15桁表記のため、下10桁になるように加工してから検索・マッピング処理を行う
            const addressNumber = row[addressNumIndex2].slice(-10);
            if (map.has(addressNumber)) {
                const rowObj = inquiryResultHeader.reduce((obj, header, i) => {
                    // 宛名番号もマッピングすると15桁の宛名番号で上書きされてしまうため、rowObjには公金受取口座照会結果ファイルの宛名番号を含めない（＝宛名番号はマージしない）
                    if (header !== '宛名番号') {
                        obj[header] = row[i];
                    }
                    return obj;
                }, {});
                // 照会が正常終了している（口座情報が取得できている）場合、マージ処理を行う
                if (row[inquiryResultMessageIndex] === '正常終了') {
                    map.set(addressNumber, { ...map.get(addressNumber), ...rowObj });
                }
                // 照会が正常終了していない（口座情報が取得できていない）場合、マージ処理は行わず、代わりに「課税区分」を「4（=未申告）」に更新する
                /*else {
                    map.get(addressNumber)['課税区分'] = '4';
                }*/
            }
            // 中間ファイル⑥にない宛名番号がある場合、警告表示用リストに追加する
            else {
                nonExistingAddresseeNumberMap.set(addressNumber, addressNumber);
            }
        });

        nonExistingAddresseeNumberMap.forEach(function (value, key) {
            nonExistingAddresseeNumber.push(value);
        });

        // 中間ファイル⑥に存在しない宛名番号がある場合、警告表示・ファイルを出力する
        if (nonExistingAddresseeNumber.length > 0) {
            logger.warn("公金受取口座照会結果ファイルに存在し、中間ファイル⑥に存在しない宛名番号が検出されました。\n件数：" + nonExistingAddresseeNumber.length);
            downloadCSV(nonExistingAddresseeNumber.join('\r\n'), "公金受取口座照会結果ファイルに存在し、中間ファイル⑥に存在しない宛名番号.csv");
        }

        // マージしたデータをCSV形式に戻し、出力する
        map.forEach(value => {
            const row = fullHeader.map(header => value[header] || '');
            output.push(row.join(','));
        });
        return output.join('\r\n') + '\r\n';
    }
}

/* 10.ServiceNowにインポートする「給付対象者ファイル」「直接振込対象者ファイル」「公金受取口座ファイル」、直接振込対象者を除外した「中間ファイル⑧」を作成する処理 */
function generateFilesforPushTargetImport() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['file24'];
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // ファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル⑦」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル⑦')) {
        alert('アップロードするファイル名を「中間ファイル⑦」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル⑦」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 10 処理を開始しました');
    //showLoading();

    // 読み込んだデータをresults配列の対応する位置に保存する
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            // 全ての処理が完了したら結果をダウンロードするためのフラグ
            let beneficiaryTextFlg = false;
            let pushTargetTextFlg = false;
            let publicAccountTextFlg = false;
            let midFileTextFlg = false;

            // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
            let text = e.target.result;

            // 中間ファイル⑥の内容を読み込む
            const { header, rows } = parseCSV(text);

            /* 給付対象者ファイルの作成処理 */
            // 給付対象者ファイルの作成に必要なカラムを定義する（後続の3ファイル作成処理でもそのまま使用可能）
            const requiredColumns = [
                '宛名番号',
                '漢字氏名',
                'カナ氏名',
                '生年月日',
                '性別',
                '電話番号',
                '現住所郵便番号',
                '現住所',
                '現住所方書',
                '世帯番号',
                '続柄１',
                '続柄２',
                '続柄３',
                '続柄４',
                '外国人通称名',
                '外国人カナ通称名',
                '英字氏名',
                '名義人氏名',
                '口座番号',
                '店番',
                '金融機関コード',
                '預貯金種目コード'
            ];
            const columnIndices = requiredColumns.map(col => header.indexOf(col));
            // 足りないカラムをチェック
            const missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

            if (missingColumns.length > 0) {
                throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
            }

            const beneficiaryText = generateBeneficiaryfile(columnIndices, rows);
            if (!beneficiaryText) {
                logger.warn('■ファイル名：' + BENEFICIARY_FILE + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                beneficiaryTextFlg = true;
            }

            /* 直接振込対象者ファイルの作成処理 */
            const pushTargetText = generatePushTargetfile(columnIndices, rows);
            if (!pushTargetText) {
                logger.warn('■ファイル名：' + PUSH_TARGET_FLG_FILE + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                pushTargetTextFlg = true;
            }

            /* 公金受取口座ファイルの作成処理 */
            const publicAccountText = generatePublicAccountfile(columnIndices, rows);
            if (!publicAccountText) {
                logger.warn('■ファイル名：' + PUBLIC_ACCOUNT_FILE + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                publicAccountTextFlg = true;
            }

            /* 中間ファイル⑧の作成処理 */
            const Midfile8Text = generateMidfile8(columnIndices, header, rows);
            if (!Midfile8Text) {
                logger.warn('■ファイル名：' + MIDDLE_FILE_8 + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                midFileTextFlg = true;
            }

            // 各ファイルをダウンロード            
            if (beneficiaryTextFlg) {
                downloadCSV(beneficiaryText, BENEFICIARY_FILE);
            }
            if (pushTargetTextFlg) {
                downloadCSV(pushTargetText, PUSH_TARGET_FLG_FILE);
            }
            if (publicAccountTextFlg) {
                downloadCSV(publicAccountText, PUBLIC_ACCOUNT_FILE);
            }
            if (midFileTextFlg) {
                downloadCSV(Midfile8Text, MIDDLE_FILE_8);
            }
        } catch (error) {
            // catchしたエラーを表示
            logger.error(error);
        } finally {
            logger.info('STEP 10 処理を終了しました');
            //hideLoading();
        }
    };
    // onloadイベントを発火
    reader.readAsText(files[0]);

    /**
    *  口座情報が存在する住民が所属する世帯の世帯員全員を抽出し、ファイル形式を整える処理
    */
    function generateBeneficiaryfile(columnIndices, rows) {
        // 出力用のヘッダーを定義する
        const outputHeader = [
            '宛名番号',
            '受給者宛名番号',
            '氏名',
            '氏名フリガナ',
            '生年月日',
            '性別',
            '電話番号',
            '郵便番号',
            '住所',
            '方書',
            '異動元郵便番号',
            '異動元住所',
            '異動元方書',
            '世帯番号',
            '世帯主宛名番号',
            '続柄',
            '郵送対象者フラグ',
            '通称名',
            '通称名カナ',
            'フォーマット種別',
            '課税区分',
            '住民カスタム属性',
            '転入日',
            '賦課期日居住者フラグ',
            '照会対象フラグ',
            '賦課無フラグ',
            '課税保留フラグ',
            '租税条約免除フラグ',
            '生活扶助非課税フラグ',
            '対象者_課税フラグ',
            '対象者_市減免後均等割額',
            '対象者_県減免後均等割額',
            '扶養主_宛名番号',
            '扶養主_課税フラグ',
            '扶養主_市免除後均等割額',
            '扶養主_県免除後均等割額',
            '専従主_宛名番号',
            '専従主_課税フラグ',
            '専従主_市減免後均等割額',
            '専従主_県減免後均等割額',
            '生活扶助認定年月日',
            '生活扶助廃止年月日'
        ];

        // 出力用の行を格納するリストを定義する
        const outputLines = [];
        // 性別カラムの変換時、中間ファイル⑦内の性別コードが「1」「2」の場合にエラーを出力するため、エラー出力用のリストを定義する
        const genderErrorAddressNums = [];
        // 続柄カラムの変換時、中間ファイル⑦内の続柄１が空の場合にエラーを出力するため、エラー出力用のリストを定義する
        const relationshipErrorAddressNums = [];

        // 口座名義カラム・口座番号カラムが空でない（直接振込対象世帯の世帯主）行を抽出する
        const filteredLines = rows.filter(line => line[columnIndices[17]] && line[columnIndices[18]]);
        // 口座名義カラム・口座番号カラムが空でない（直接振込対象世帯の世帯主）行毎に、宛名番号・世帯番号を取得後、出力用リストに追加する処理を行う
        filteredLines.forEach(line => {
            const addressNum = line[columnIndices[0]]; // 宛名番号を取得する
            const householdNum = line[columnIndices[9]]; // 世帯番号を取得する

            // 世帯主行を出力用リストに追加する。その際、「受給者宛名番号」は空に設定する
            outputLines.push(createOutputLineForBeneficiaryFile(line, columnIndices, ''));

            // 世帯番号をキーにして、世帯主以外の世帯員レコードを取得する
            const householdMemberLines = rows.filter(otherLine => otherLine[columnIndices[9]] === householdNum && otherLine !== line);

            // 世帯員の行を出力用リストに追加する。その際、「受給者宛名番号」に世帯主の宛名番号を設定する
            householdMemberLines.forEach(line => {
                outputLines.push(createOutputLineForBeneficiaryFile(line, columnIndices, addressNum));
            });
        });

        /**
         * 抽出後の行のうち必要なカラムのみを抽出し、出力用の行を作成する処理
         * @param {Array} line - 出力用の行を作成する元となる行
         * @param {Array} columnIndices - 出力用の行を作成する元となる行のカラムインデックス
         * @param {String} addressNum - 出力用の行に設定する「受給者宛名番号」（世帯主の場合は空（''）、他世帯員の場合は世帯主の宛名番号を引数として設定する）
         * @returns {Array} 必要なカラムのみを抽出し、出力用の行を作成した結果
        */
        function createOutputLineForBeneficiaryFile(line, columnIndices, addressNum) {
            let semiProcessedAddressNum = addressNum;
            // 引数「addressNum」が空でない場合、15桁の宛名番号に変換する
            if (addressNum !== '') {
                semiProcessedAddressNum = addressNum.toString().padStart(15, '0');
            }
            // 定数として定義しなおす
            const processedAddressNum = semiProcessedAddressNum

            // 性別コードを変換し、エラーがあればエラー出力用リストに追加する
            let genderCode = convertGenderCode(line[columnIndices[4]]);
            if (genderCode === '') {
                genderErrorAddressNums.push(line[columnIndices[0]]);
            }

            // 続柄コードを変換し、エラーがあればエラー出力用リストに追加する
            let relationshipCode = convertRelationshipCode(line[columnIndices[10]], line[columnIndices[11]], line[columnIndices[12]], line[columnIndices[13]]);
            if (relationshipCode === '') {
                relationshipErrorAddressNums.push(line[columnIndices[0]]);
            }

            return [
                // 以下、テンプレートのカラム  
                line[columnIndices[0]].toString().padStart(15, '0'), // 宛名番号（15桁に変換する）
                processedAddressNum, // 受給者宛名番号（世帯主の場合は空、他世帯員の場合は世帯主の宛名番号を15桁に変換した番号を設定する）
                line[columnIndices[1] || columnIndices[13]], // 漢字氏名（漢字氏名が無い場合は英字氏名を入力する）
                line[columnIndices[2]], // カナ氏名
                separateDate(line[columnIndices[3]], '/'), // 生年月日（「yyyy/mm/dd」形式に変換する）
                genderCode, // 性別
                excludeHyphen(line[columnIndices[5]]), // 電話番号（ハイフンを除去する）
                excludeHyphen(line[columnIndices[6]]), // 郵便番号（ハイフンを除去する）
                line[columnIndices[7]], // 住所
                line[columnIndices[8]], // 方書
                '', // 異動元郵便番号
                '', // 異動元住所
                '', // 異動元方書
                line[columnIndices[9]].toString().padStart(15, '0'), // 世帯番号
                '', // 世帯主宛名番号（世帯主行は空にする）
                relationshipCode, // 続柄
                '1', // 郵送対象者フラグ（郵送対象者のため「1」を設定）
                line[columnIndices[14]], // 外国人通称名
                line[columnIndices[15]], // 外国人カナ通称名
                '非課税均等割確認書', // フォーマット種別（固定値）
                'R6S1SBS', // 課税区分（固定値）
                '', // 住民カスタム属性（空）
                // 以下、非課税・均等割特有のカラム
                '', // 転入日
                '', // 賦課期日居住者フラグ
                '', // 照会対象フラグ
                '', // 賦課無フラグ
                '', // 課税保留フラグ
                '', // 租税条約免除フラグ
                '', // 生活扶助非課税フラグ
                '', // 対象者_課税フラグ
                '', // 対象者_市減免後均等割額
                '', // 対象者_県減免後均等割額
                '', // 扶養主_宛名番号
                '', // 扶養主_課税フラグ
                '', // 扶養主_市免除後均等割額
                '', // 扶養主_県免除後均等割額
                '', // 専従主_宛名番号
                '', // 専従主_課税フラグ
                '', // 専従主_市減免後均等割額
                '', // 専従主_県減免後均等割額
                '', // 生活扶助認定年月日
                '' // 生活扶助廃止年月日
            ];
        }

        // 性別コードによるエラーがあれば例外を投げる
        if (genderErrorAddressNums.length > 0) {
            throw new Error('以下の住民の性別カラムに「1」「2」以外の値が入力されています。ファイルの確認をお願いします。\n' + genderErrorAddressNums.join('\n'))
        }

        // 続柄コードによるエラーがあれば例外を投げる
        if (relationshipErrorAddressNums.length > 0) {
            throw new Error('以下の住民の続柄１カラムが空です。ファイルの確認をお願いします。\n' + relationshipErrorAddressNums.join('\n'))
        }

        // 出力用リストをカンマで結合し、改行で区切られた文字列に変換
        return formatOutputFile(outputHeader, outputLines, NEWLINE_CHAR_CRLF);
    }

    /**
    * 直接振込対象者ファイル（フラグ用ファイル）を作成する処理。対象世帯の世帯主、および世帯員全員「直接振込対象者フラグ」カラムに「1（＝直接振込対象者として設定する）」を設定する
    */
    function generatePushTargetfile(columnIndices, rows) {
        // 出力用のヘッダーを定義する
        const outputHeader = [
            '宛名番号',
            '直接振込対象者フラグ',
            '課税区分キー',
        ];

        // 出力用の行を格納するリストを定義する
        const outputLines = [];

        // 抽出対象の世帯番号の値を収集するためのセットを作成する
        const beneficiaryHouseholdNumSet = new Set();

        // 名義人カラム・公金口座番号カラムが空でない（プッシュ対象世帯の世帯主）行の「世帯番号」を収集する
        rows.forEach((line) => {
            if (line[columnIndices[17]] && line[columnIndices[18]]) {
                // 「世帯番号」の値をセットに追加する
                beneficiaryHouseholdNumSet.add(line[columnIndices[9]]);
            }
        });

        // 収集した世帯番号に属する行（対象世帯員全員）を抽出する
        const filteredLines = rows.filter((line) => {
            return beneficiaryHouseholdNumSet.has(line[columnIndices[9]]);
        });

        // 抽出した行のうち必要なカラムのみ出力用リストに追加する
        filteredLines.forEach(line => {
            outputLines.push([
                line[columnIndices[0]].toString().padStart(15, '0'), // 宛名番号
                '1', // 直接振込対象者フラグ（固定値「1」）
                'R6S1' // 課税区分キー（固定値「R6S1」）
            ]);
        });

        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return formatOutputFile(outputHeader, outputLines, NEWLINE_CHAR_CRLF);
    }

    /**
    * 口座情報ファイルを作成する処理
    */
    function generatePublicAccountfile(columnIndices, rows) {
        // 出力用のヘッダーを定義する
        const outputHeader = [
            '宛名番号',
            '口座名義',
            '口座番号',
            '支店コード',
            '金融機関コード',
            '預金種別',
            '取込元種別'
        ];

        // 口座情報が存在する行を抽出する
        const filteredLines = rows.filter(line => {
            const [accountName, accountNum] = [
                line[columnIndices[17]],
                line[columnIndices[18]]
            ];
            // 口座名義と口座番号が存在する場合、抽出対象とする（プッシュ対象者かつ口座情報が取得できている判定）
            return accountName && accountNum;
        });

        // フィルタリングされた行から、必要なカラムのデータのみを抽出する
        const selectedLines = filteredLines.map(line => [
            line[columnIndices[0]].toString().padStart(15, '0'), // 宛名番号は左側0埋め15桁に変換する
            line[columnIndices[17]],
            line[columnIndices[18]],
            line[columnIndices[19]],
            line[columnIndices[20]],
            line[columnIndices[21]],
            'R6S1SBS' // 「取込元種別」カラムには固定値「R6S1SBS」を設定する
        ]);

        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return formatOutputFile(outputHeader, selectedLines, NEWLINE_CHAR_CRLF);
    }

    /**
    * 公金口座情報がある住民とその世帯員（プッシュ対象者）を除外し、中間ファイル⑧を作成する処理
    */
    function generateMidfile8(columnIndices, header, rows) {
        // 除外対象の世帯番号の値を収集するためのセットを作成する
        const excludedHouseholdNumSet = new Set();

        // 口座名義カラム・口座番号カラムが空でない行の「世帯番号」を収集する
        rows.forEach((line) => {
            if (line[columnIndices[17]] && line[columnIndices[18]]) {
                // 「世帯番号」の値をセットに追加する
                excludedHouseholdNumSet.add(line[columnIndices[9]]);
            }
        });

        // 収集した世帯番号に属する行を除外する
        const filteredLines = rows.filter((line) => {
            return !excludedHouseholdNumSet.has(line[columnIndices[9]]);
        });

        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return formatOutputFile(header, filteredLines, NEWLINE_CHAR_CRLF);
    }
}

/* 12. 旧宛名番号に紐づく税情報を取得し、現宛名番号に紐づけ課税区分判定を行う処理*/
function determineTaxClassfromOldAddressNum() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['file27', 'file28', 'file29'];
    // 各ファイルのIDを配列に格納する
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 「中間ファイル⑨」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル⑨')) {
        alert('アップロードするファイル名を「中間ファイル⑨」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル⑨」で始まらない場合はエラーを出して処理終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 12 処理を開始しました');
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
                    // 読み込んだファイル内データのマージ処理
                    const mergedCSV = mergeCSVwithOldAddressNum(...results);
                    // 課税対象の住民を除外する処理
                    const excludeTaxableText = filterTaxExcluded(mergedCSV);
                    // アウトプットファイルのダウンロード処理
                    downloadCSV(excludeTaxableText, MIDDLE_FILE_10);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 12 処理を終了しました');
                    // hideLoading();
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function mergeCSVwithOldAddressNum(...csvFiles) {
        // 各CSVファイルをヘッダーとデータ行に分解し、配列に格納する
        const parsedCSVs = csvFiles.map(csv => parseCSV(csv));

        // 各ファイルヘッダー内の「ＦＩ－」を取り除く
        parsedCSVs.forEach(parsed => parsed.header = removeStrFromHeader(parsed.header, "ＦＩ－"));

        // 各ファイル内の必要なカラムのインデックスを取得する
        const addressNumIndex1 = parsedCSVs[0].header.indexOf('宛名番号'); // 中間ファイル⑩の宛名番号カラム
        const causeForRectificationIndex = parsedCSVs[0].header.indexOf('更正事由'); // 中間ファイル⑩の更正事由カラム
        const incomePercentageIndex = parsedCSVs[0].header.indexOf('所得割額'); // 中間ファイル⑩の所得割額カラム
        const equalPercentageIndex = parsedCSVs[0].header.indexOf('均等割額'); // 中間ファイル⑩の均等割額カラム
        const taxClassIndex = parsedCSVs[0].header.indexOf('課税区分'); // 中間ファイル⑩の課税区分カラム
        const oldAddressNumIndex = parsedCSVs[1].header.indexOf('旧宛名番号'); // 現宛名番号の住民票コードに紐づく旧宛名番号ファイルの旧宛名番号カラム
        const addressNumIndex3 = parsedCSVs[2].header.indexOf('宛名番号'); // 賦課マスタファイルの宛名番号カラム

        // 最終的に「現宛名番号の住民票コードに紐づく旧宛名番号」ファイルと「賦課マスタ」をマージした結果を格納する配列を定義する
        const oldAddressmergedData = [];

        // 一時的に「現宛名番号の住民票コードに紐づく旧宛名番号」ファイルと「賦課マスタ」をマージするためのMap（作業領域）を定義する
        const oldAddressNumMap = new Map();

        // 「現宛名番号の住民票コードに紐づく旧宛名番号」ファイルをマッピングする
        parsedCSVs[1].rows.forEach(row => {
            const oldAddressNum = row[oldAddressNumIndex];
            const rowObj = parsedCSVs[1].header.reduce((obj, header, i) => {
                obj[header] = row[i];
                return obj;
            }, {});
            oldAddressNumMap.set(oldAddressNum, rowObj);
        });

        // 「現宛名番号の住民票コードに紐づく旧宛名番号」ファイルの「旧宛名番号」と、「賦課マスタ」ファイルの「宛名番号」をキーにして、2ファイルをマージする
        parsedCSVs[2].rows.forEach(row => {
            const levyAddressNum = row[addressNumIndex3];
            const rowObj = parsedCSVs[2].header.reduce((obj, header, i) => {
                obj[header] = row[i];
                return obj;
            }, {});
            if (oldAddressNumMap.has(levyAddressNum)) {
                // 後続処理では「旧宛名番号」ではなく「現宛名番号」をキーとするため、Mapに格納したデータをkeyを設定しない配列に再格納する
                const mergedObj = { ...oldAddressNumMap.get(levyAddressNum), ...rowObj };
                oldAddressmergedData.push(mergedObj);
            }
        });

        // 2ファイルをマージしたデータに対し、「所得割額」「均等割額」「更正事由」カラムの値を利用して課税区分判定を行う
        oldAddressmergedData.forEach((value) => {
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

        // 中間ファイル⑩の「宛名番号」がmergedData内の「現宛名番号」と一致する行について、各税情報カラムの値を更新する処理
        const updatedRows = parsedCSVs[0].rows.map(line => {
            const addressNum = line[addressNumIndex1];
            // 中間ファイル⑩の「宛名番号」がmergedData内の「現宛名番号」と一致する行を検索する
            const matchedData = oldAddressmergedData.find(data => data['現宛名番号'] === addressNum);
            if (matchedData) {
                // 中間ファイル⑩内の「所得割額」「均等割額」「課税区分」「更正事由」カラムの値を更新する
                line[incomePercentageIndex] = matchedData['所得割額'];
                line[equalPercentageIndex] = matchedData['均等割額'];
                line[taxClassIndex] = matchedData['課税区分'];
                line[causeForRectificationIndex] = matchedData['更正事由'];
            }
            return line;
        });

        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return formatOutputFile(parsedCSVs[0].header, updatedRows, NEWLINE_CHAR_CRLF);
    }
}

/* 13.再番号連携対象の住民に関して、番号連携用ファイル（DAT）を作成する処理 */
function generateTaxInfoReferenceFile() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['file30'];
    // 出力ファイル名を定義する
    const taxInfoReferenceFile = "P640R110_" + getCurrentTime().replace(/[:.\-\s]/g, '').trim().slice(0, 14); // 税情報照会用ファイル（YYYYMMDDHHmmssの14桁）

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
    logger.info('STEP 13 処理を開始しました');
    //showLoading();

    // 読み込んだデータをresults配列の対応する位置に保存する
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
            let text = e.target.result;

            // 必要な項目があるかチェックする
            const { header, rows } = parseCSV(text);
            const requiredColumns = [
                '宛名番号',
                '照会先自治体コード'
            ];
            const columnIndices = requiredColumns.map(col => header.indexOf(col));
            // 足りないカラムをチェック
            const missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

            if (missingColumns.length > 0) {
                throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
            }

            // ヘッダー項目をリネーム（「照会先自治体コード」→「転入元都道府県市区町村コード」へリネーム）して、再度カンマで結合、改行で区切られた文字列に変換する
            const changeHeaderText = formatOutputFile(['宛名番号', '転入元都道府県市区町村コード'], rows, NEWLINE_CHAR_CRLF)

            // ヘッダー名をリネームしたファイルを税情報照会用ファイルの形式に変換する
            const taxInfoReferenceText = generateFixedLengthFile(changeHeaderText, 'JT01010000000214', 'TM00000000000002');
            if (!taxInfoReferenceText) {
                logger.warn('■ファイル名：' + taxInfoReferenceFile + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                downloadCSV(taxInfoReferenceText, taxInfoReferenceFile, true);
            }
        } catch (error) {
            // catchしたエラーを表示
            logger.error(error);
        } finally {
            logger.info('STEP 13 処理を終了しました');
            //hideLoading();
        }
    };
    // onloadイベントを発火
    reader.readAsText(files[0]);
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
 * ①課税区分に値がある行除外 ②前住所コードの値による行除外 ③異動事由コードの値による行除外処理
 */
function FilterTaxAndAddressAndMovementReason(columnIndices, header, rows, errorAddressNums = []) {
    const validCodes = ['A51', 'A52', 'A61', 'A62', 'BE1', 'BE2', 'BF1', 'BF2'];

    // 条件に合致するレコードのみをフィルタ
    const filteredLines = rows.filter(line => {
        const [taxClassification, previousAddressCode, changeReasonCode] = [
            line[columnIndices[2]],
            line[columnIndices[3]],
            line[columnIndices[4]]
        ];
        // errorAddressNumsの配列が存在する場合のみ、配列に含まれない宛名番号は除外する（エラー対応ステップ向け）
        if (errorAddressNums.length > 0) {
            return (taxClassification == '' && previousAddressCode !== '99999' && !validCodes.includes(changeReasonCode) && errorAddressNums.includes(line[columnIndices[0]]));
        }
        // errorAddressNumsの配列が存在しない場合は、STEP5の処理を行う
        else {
            return (taxClassification == '' && previousAddressCode !== '99999' && !validCodes.includes(changeReasonCode));
        }
    });
    // generateFixedLengthFileにテキストを渡し、中間サーバに連携する向けにファイル形式を整える
    // 口座照会用ファイルと仕様は同じだが「事務手続きコード」「情報提供者機関コード」「特定個人情報名コード」が異なるため、引数で値を渡す
    return generateFixedLengthFile([header.join(','), ...filteredLines.map(line => line.join(','))].join('\r\n'), 'JT01010000000214', 'TM00000000000002');
}

/**
 * 税情報照会結果ファイル（ヘッダー無しファイル）にヘッダーを付与する処理
 * @param {string} text 税情報照会結果ファイルのデータを文字列化して入力
 * @return {string} ヘッダーを付与した税情報照会結果ファイルのデータを文字列化して出力
 */
function createHeaderForTaxInfoInquiryFile(text) {
    // ファイル一行目に追加する用のヘッダーを定義する
    let column = new Array(262);

    // カラムが最初空文字列で初期化されているため、1から始まるようにする
    for (let i = 0; i < column.length; i++) {
        column[i] = i + 1;
    }

    // 後続処理で使用するカラム名は連番とは別で定義する
    column[1] = '宛名番号';
    column[12] = '情報提供者機関コード'; // 前住所地コードの有無を判定するために設定
    column[23] = '照会ステータス（明細単位）'; // 正常終了（税情報が取得できたかどうか）を判別するために設定
    column[24] = '照会処理結果メッセージ（明細単位）'; // 異常終了の行を特定するために設定
    column[25] = '照会ステータス（特定個人情報名単位）'; // 正常終了（税情報が取得できたかどうか）を判別するために設定
    column[230] = '市町村民税均等割額'; // 税区分を判定するために設定
    column[254] = '市町村民税所得割額（定額減税前）'; // 税区分を判定するために設定

    // ヘッダー配列を「,」で区切り、税情報照会ファイルの先頭に追加して呼び出し元に返す
    return column.join(',') + NEWLINE_CHAR_CRLF + text;
}

/**
 * yyyymmdd形式の日付をDateオブジェクトに変換する
 * @param {string} yyyymmdd yyyymmdd形式の日付
 * @return {Date} 日付文字列を解析して生成されたDateオブジェクト
 */
function parseDate(yyyymmdd) {
    const year = yyyymmdd.substring(0, 4);
    const month = yyyymmdd.substring(4, 6) - 1;
    const day = yyyymmdd.substring(6, 8);
    return new Date(year, month, day);
}

/**
 * yyyymmdd形式の日付を、「yyyy{separator}mm{separator}dd」形式に変換する
 * @param {string} yyyymmdd yyyymmdd形式の日付
 * @param {string} separator 日付の区切り文字（デフォルトは空文字）
 * @return {string} 日付文字列を分割して生成された文字列
 */
function separateDate(yyyymmdd, separator = '') {
    const year = yyyymmdd.substring(0, 4);
    const month = yyyymmdd.substring(4, 6);
    const day = yyyymmdd.substring(6, 8);
    return String(year + separator + month + separator + day);
}

/**
 * 住基情報内「性別」のコードを「男性」「女性」または空文字に変換する
 * @param {string} genderCode 「1」または「2」の性別コード
 * @return {string} 「男性」または「女性」または空文字
 */
function convertGenderCode(genderCode) {
    if (genderCode === '1') {
        return '男性';
    }
    else if (genderCode === '2') {
        return '女性';
    }
    // 性別が「1」「2」以外である場合、エラー表示のために空文字を返す
    else {
        return '';
    }
}

/**
 * 住基情報内「-」がついている文字列から「-」を取り除く
 * @param {string} textWithHyphen 「-」がついている文字列
 * @return {string} 「-」を取り除いた文字列
 */
function excludeHyphen(textWithHyphen) {
    return textWithHyphen.replace(/-/g, '');
}

/**
 * 住基情報内「続柄」のコードを変換する。「続柄２」以降に値がある（2つ以上属性がある）場合、「の」繋ぎの続柄を作成する
 * @param {string} relationship1 続柄１のコード
 * @param {string} relationship2 続柄２のコード
 * @param {string} relationship3 続柄３のコード
 * @param {string} relationship4 続柄４のコード
 * @return {string} 文字列変換後の続柄
 */
function convertRelationshipCode(relationship1, relationship2, relationship3, relationship4) {
    // 続柄コードと変換後の文字列の対応を定義
    const RelationshipCodeMap = {
        '02': '世帯主',
        '03': '準世帯主',
        '11': '夫',
        '12': '妻',
        '13': '夫(未届)',
        '14': '妻(未届)',
        '20': '子',
        '2X': '子()',
        '51': '父',
        '52': '母',
        '71': '兄',
        '74': '弟',
        '81': '姉',
        '84': '妹',
        '96': '縁故者',
        '98': '使用人',
        '99': '同居人',
        '53': '養父',
        '54': '養母',
        '9Z': 'その他'
    };

    // 変換された値を格納するための配列
    const convertedRelationship = [];

    // 続柄１の変換処理
    if (relationship1 !== '') {
        convertedRelationship.push(RelationshipCodeMap[relationship1] || relationship1);
    }
    // 続柄１が空の場合はエラー表示のため空文字を返す
    else {
        return '';
    }

    // 続柄２の変換処理
    if (relationship2 !== '') {
        convertedRelationship.push(RelationshipCodeMap[relationship2] || relationship2);
    }

    // 続柄３の変換処理
    if (relationship3 !== '') {
        convertedRelationship.push(RelationshipCodeMap[relationship3] || relationship3);
    }

    // 続柄４の変換処理
    if (relationship4 !== '') {
        convertedRelationship.push(RelationshipCodeMap[relationship4] || relationship4);
    }

    // 変換された値を "の" で結合して返す
    return convertedRelationship.join('の');
}

/**
 * ヘッダー行とヘッダー以外のデータ行を結合し、指定された改行コードを使用してアウトプットファイルの形式に整形する処理
 * @param {string[]} header ヘッダー行の文字列の配列
 * @param {string[]} rows ヘッダー以外のデータ行の文字列の配列
 * @param {string} newlineCode ファイルの改行コード
 * @return {string} ヘッダー行とデータ行を結合したアウトプットファイルの文字列
 */
function formatOutputFile(header, rows, newlineCode) {
    return [header.join(','), ...rows.map(row => row.join(','))].join(newlineCode) + newlineCode;
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