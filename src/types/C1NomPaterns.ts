export const regexPatterns = [
  {
    name: 'Конденсатор чип CC',
    params: [
      { name: 'CC Емкость', pattern: /\d+(,\d+)?\s*[a-zA-Z]+F/i },
      { name: 'CC Точность', pattern: /[±]\d+%/i },
      { name: 'CC Напряжение', pattern: /\d+v/i },
      { name: 'CC Код.', pattern: /[NXYZC]{1}[578P0]{1}[RO0VUG]{1}/i },
      { name: 'CC Корпус', pattern: /\(\d+\)/i },
    ],
  },
  {
    name: 'Резистор чип RC',
    params: [
      { name: 'RC Корпус', pattern: /(\d{4})/i },
      { name: 'RC Сопротивление', pattern: /(\d+(\.\d+)?[kKR]?|(\d+(\.\d+)?[R]))/i },
      { name: 'RC Точность', pattern: /[±]\d+%/i },
    ],
  },
];
