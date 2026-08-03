#[macro_export]
macro_rules! assert_tx_success {
    ($res:expr, $label:expr) => {{
        let r = $res;
        assert!(
            r.is_success(),
            "{} failed: {:#?}",
            $label,
            r.get_result()
        );
    }};
}

#[macro_export]
macro_rules! assert_tx_failure {
    ($res:expr, $label:expr) => {{
        let r = $res;
        assert!(
            !r.is_success(),
            "{} should have failed but succeeded: {:#?}",
            $label,
            r.get_result()
        );
    }};
}
