const date = Variable('', {
    poll: [1000, 'date "+%R"'],
});

export default function Clock() {
    return Widget.Label({
        className: 'clock',
        label: date.bind(),
    });
}
