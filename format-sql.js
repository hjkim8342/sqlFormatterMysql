#!/usr/bin/env node
let sql = "";

process.stdin.setEncoding("utf-8");

process.stdin.on("data", (chunk) => {
  sql += chunk;
});

process.stdin.on("end", () => {
  // 1. 연속 공백 제거
  let formatted = sql.replace(/\s+/g, " ");
  // (, ), , 특수문자 좌우 공백 모두 제거
  formatted = formatted.replace(/\s*\(\s*/g, "(");
  formatted = formatted.replace(/\s*\)\s*/g, ")");
  formatted = formatted.replace(/\s*,\s*/g, ",");
  formatted = formatted.replace(/\s*;\s*/g, ";");

  // 2. 주요 키워드 줄바꿈 + 뒤 공백 1칸
  const keywords = [
    "SELECT",
    "DELETE",
    "UPDATE",
    "INSERT",
    "FROM",
    "WHERE",
    "JOIN",
    "INNER JOIN",
    "OUTER JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "FULL JOIN",
    "CROSS JOIN",
    "NATURAL JOIN",
    "LEFT OUTER JOIN",
    "RIGHT OUTER JOIN",
    "FULL OUTER JOIN",
    "CROSS OUTER JOIN",
    "NATURAL OUTER JOIN",
    "GROUP BY",
    "ORDER BY",
    "LIMIT",
    "SET",
    "HAVING",
    "UNION",
    "EXCEPT",
    "INTERSECT",
    "UNION ALL",
    "EXCEPT ALL",
    "INTERSECT ALL",
    "UNION DISTINCT",
    "EXCEPT DISTINCT",
    "INTERSECT DISTINCT",
    "UNION DISTINCT",
    "EXCEPT DISTINCT",
    "INTERSECT DISTINCT",
    "UNION DISTINCT",
    "EXCEPT DISTINCT",
    "INTERSECT DISTINCT",
    "UNION DISTINCT",
    "EXCEPT DISTINCT",
    "INTERSECT DISTINCT",
  ];
  const regex = new RegExp(`\\b(${keywords.join("|")})\\b`, "gi");
  let firstKeyword = true;
  formatted = formatted.replace(regex, (m) => {
    if (firstKeyword) {
      firstKeyword = false;
      return m.toUpperCase();
    } else {
      return "\n" + m.toUpperCase();
    }
  });

  // ===== 콤마 처리 개선 (괄호/SELECT 절 조건 포함) =====
  formatted = formatted.replace(/,\s*/g, function (match, offset, str) {
    const before = str.slice(0, offset);
    const upperBefore = before.toUpperCase();

    // LIMIT 뒤는 무시 (예: ORDER BY x LIMIT 10, ...)
    if (/LIMIT\s+\d*$/i.test(upperBefore.trim())) {
      return ", ";
    }

    // 괄호 깊이 판단: 콤마 앞까지 열린 '(' 수와 닫힌 ')' 수 비교
    const openCount = (upperBefore.match(/\(/g) || []).length;
    const closeCount = (upperBefore.match(/\)/g) || []).length;
    const inParen = openCount > closeCount;

    if (inParen) {
      // 가장 가까운 '('의 인덱스 (콤마 기준으로 뒤집어 찾음)
      const lastOpenIndex = before.lastIndexOf("(");
      if (lastOpenIndex !== -1) {
        // 해당 '('의 짝 닫는 ')'을 찾기 위해 앞으로 스캔
        let depth = 0;
        let matchCloseIndex = -1;
        for (let i = lastOpenIndex; i < str.length; i++) {
          const ch = str[i];
          if (ch === "(") depth++;
          else if (ch === ")") {
            depth--;
            if (depth === 0) {
              matchCloseIndex = i;
              break;
            }
          }
        }
        // matchCloseIndex가 -1이면 아직 닫히지 않은 경우(문법상 불완전) —
        // 그때는 괄호 시작부터 콤마 직전까지를 검사
        const inside =
          matchCloseIndex === -1
            ? str.slice(lastOpenIndex + 1, offset)
            : str.slice(lastOpenIndex + 1, matchCloseIndex);

        const hasSelect = /\bSELECT\b/i.test(inside);
        if (!hasSelect) {
          // 괄호 안인데 SELECT가 없으면 줄바꿈/들여쓰기 하지 않음
          return ", ";
        } else {
          // 괄호 안에 SELECT가 있으면 줄바꿈 + 들여쓰기
          return "\n    , ";
        }
      } else {
        // 안전장치: '('를 못 찾으면 기본 처리
        return "\n    , ";
      }
    }

    // 괄호 밖의 기본 동작: 줄바꿈 + 들여쓰기
    return "\n    , ";
  });

  // ===== ')' 바로 뒤에 AND/OR/ON 붙어있는 경우 공백 삽입 (예: ")AND" -> ") AND") =====
  formatted = formatted.replace(/\)(?=(AND|OR|ON|AS)\b)/gi, ") ");

  // WHERE/HAVING 이후 범위에서의 괄호 깊이만 고려하여 서브쿼리 외부 괄호 영향 제거
  formatted = formatted.replace(
    /\s+(AND NOT EXISTS|AND EXISTS|OR NOT EXISTS|OR EXISTS|AND|OR|ON)\s+/gi,
    function (match, p1, offset, str) {
      // 복합 키워드(AND NOT EXISTS 등)면 무조건 한 줄
      if (/^(AND|OR) (NOT )?EXISTS$/i.test(p1)) {
        return " " + p1 + " ";
      }
      // 나머지 AND/OR/ON: 괄호 패턴 내부만 한 줄
      const ustr = str.toUpperCase();
      let found = false;
      ["WHERE(", "HAVING(", "AND(", "OR(", "ON("].forEach((prefix) => {
        const pIdx = ustr.lastIndexOf(prefix, offset);
        if (pIdx !== -1) {
          // 괄호 범위
          let depth = 0,
            sIdx = -1,
            eIdx = -1;
          for (let i = pIdx + prefix.length - 1; i < str.length; i++) {
            if (str[i] === "(") {
              if (depth === 0) sIdx = i;
              depth++;
            }
            if (str[i] === ")") {
              depth--;
              if (depth === 0) {
                eIdx = i;
                break;
              }
            }
          }
          if (sIdx !== -1 && eIdx !== -1 && offset > sIdx && offset < eIdx) {
            found = true;
          }
        }
      });
      if (found) return " " + p1 + " ";
      return "\n    " + p1 + " ";
    }
  );

  function isExtraIndentBlock(formatted, i) {
    // 바로 앞에 AND(, OR(, ON(, JOIN(, EXISTS( 등 패턴인지(공백 없이)
    const check = formatted.slice(Math.max(0, i - 7), i + 1).toUpperCase();
    return /(?:AND\(|OR\(|ON\(|JOIN\(|EXISTS\()$/.test(check);
  }

  // 3. 괄호 들여쓰기 처리
  let result = "";
  let indentLevel = 0;
  let inLineStart = true;
  let extraIndentStack = [];
  for (let i = 0; i < formatted.length; i++) {
    const char = formatted[i];
    if (char === "(") {
      let isExtra = false;
      if (isExtraIndentBlock(formatted, i)) {
        indentLevel++;
        isExtra = true;
      }
      indentLevel++;
      if (isExtra) extraIndentStack.push(i);
      result += char;
      inLineStart = false;
      continue;
    } else if (char === ")") {
      indentLevel--;
      // extra indent 적용된 괄호 닫힘일 경우 한 번 더 내림
      if (
        extraIndentStack.length &&
        extraIndentStack[extraIndentStack.length - 1] < i
      ) {
        indentLevel--;
        extraIndentStack.pop();
      }
      if (inLineStart) result += "    ".repeat(Math.max(0, indentLevel));
      result += char;
      inLineStart = false;
      continue;
    } else if (char === "\n") {
      result += char;
      inLineStart = true;
      continue;
    } else {
      if (inLineStart) {
        result += "    ".repeat(Math.max(0, indentLevel));
        inLineStart = false;
      }
      result += char;
    }
  }
  formatted = result;

  // WHERE( / HAVING( / AND( / OR( / ON( → 키워드 뒤 공백 삽입하여 WHERE ( 형태로 보정
  formatted = formatted.replace(
    /\b(WHERE|HAVING|AND|OR|ON|JOIN|EXISTS|IN)\(/gi,
    "$1 ("
  );

  // 닫힘 괄호 ) 뒤에 줄바꿈이나 공백이 없으면 공백 하나 삽입
  formatted = formatted.replace(/\)(?!\s|\n)/g, ") ");
  // 줄바꿈 앞에 공백이 있으면 공백 제거
  formatted = formatted.replace(/\s+\n/g, "\n");

  process.stdout.write(formatted);

  // process.stdout.write(formatted);
  // return;
});
