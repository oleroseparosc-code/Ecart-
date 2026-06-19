type RoomWithUpdateDate = {
  id: string;
  sourceUpdatedAt?: string;
};

export function formatRoomUpdatedAt(date = new Date()) {
  return `${String(date.getFullYear()).slice(-2)}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export function effectiveRoomUpdatedAt(room: RoomWithUpdateDate, editedDates: Record<string, string>) {
  return editedDates[room.id] || room.sourceUpdatedAt || "";
}

export function markRoomsUpdated(
  editedDates: Record<string, string>,
  roomIds: string[],
  date = new Date(),
): Record<string, string> {
  const stamp = formatRoomUpdatedAt(date);
  return roomIds.reduce<Record<string, string>>(
    (next, roomId) => {
      next[roomId] = stamp;
      return next;
    },
    { ...editedDates },
  );
}
