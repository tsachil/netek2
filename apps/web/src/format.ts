const heDateTime = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeStyle: "short"
});

const heDate = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium"
});

export function formatDate(value: string | Date) {
  return heDate.format(new Date(value));
}

export function formatDateTime(value: string | Date) {
  return heDateTime.format(new Date(value));
}
