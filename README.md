# Heemee Audio Notes

Heemee Audio Notes는 음원별 정보를 기록하고 공유하기 위한 정적 웹 앱입니다. `data/items.json`에 저장된 음원 데이터를 불러와 곡 제목, 정보, 가사 등을 보여주고, 곡별 주의사항과 항목 순서를 개인 브라우저에 저장할 수 있습니다.

## GitHub Pages

https://daumlee.github.io/Heemee/

## 주요 기능

- 곡별 음원, 메트로놈, 가사, 주의사항 등 기록
- 주의사항 수정 내용과 항목 순서를 브라우저 `localStorage`에 저장
- 아이템 카드를 드래그/롱탭해서 순서 변경 가능

## 프로젝트 구조

```text
.
|-- index.html
|-- styles.css
|-- script.js
`-- data/
    `-- items.json
```

## 데이터 형식

음원 데이터는 `data/items.json`에 배열 형태로 저장됩니다.

```json
{
  "id": "item-id",
  "name": "곡 제목",
  "info": "BPM: ; 박자표",
  "lyrics": "가사",
  "notes": "주의사항",
  "audioDataUrl": "음원 파일 주소"
}
```

## 필드 설명

- `id`: 각 음원을 구분하는 고유 ID
- `name`: 카드에 표시되는 곡 제목
- `info`: BPM, Key, 구성, 메모 등 곡 정보
- `lyrics`: 가사
- `notes`: 사용자가 화면에서 수정할 수 있는 주의사항
- `audioDataUrl`: 오디오 플레이어에 사용할 선택적 오디오 데이터 URL

## 로컬 저장 방식

앱은 브라우저 `localStorage`의 아래 키에 수정 내용을 저장합니다.

```text
audioItemStorage
```

로컬 저장 데이터가 있으면 `data/items.json`보다 로컬 데이터를 우선해서 보여줍니다. 그래서 주의사항 수정 내용과 드래그로 바꾼 항목 순서가 새로고침 후에도 유지됩니다.

`로컬 초기화` 버튼을 누르면 로컬 저장 데이터를 지우고 `data/items.json`에서 다시 불러옵니다.

## JSON 내보내기

`업데이트` 버튼을 누르면 현재 화면의 데이터를 `items.json` 파일로 내보낼 수 있습니다. 내보내기 전에 확인 팝업이 표시되며, 내보낸 파일에는 현재 항목 순서와 수정된 주의사항이 포함됩니다.
변경이 필요한 사항이 있다면 Json을 Owner에게 보내주세요, 빠르게 업데이트하도록 하겠습니다.

## 참고

- 화면에서는 음원을 추가하거나 삭제할 수 없습니다.
- 곡 제목, 정보, 가사 같은 원본 데이터는 `data/items.json`에서 직접 수정합니다.