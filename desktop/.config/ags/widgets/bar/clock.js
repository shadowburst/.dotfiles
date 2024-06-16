const date = Variable('', {
    poll: [1000, 'date "+%R"'],
});

function Clock() {
    return Widget.Label({
        class_name: 'clock',
        label: date.bind(),
    });
}

export default Clock;
