const date = Variable('', {
    poll: [1000, 'date "+%R"'],
});

export default function Clock() {
    return Widget.Label({
        class_name: 'clock',
        label: date.bind(),
    });
}
